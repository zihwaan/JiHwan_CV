"""
API-key authentication.

The agent only runs against Anthropic's API directly — the old Claude-CLI
subscription flow was removed because it can't be driven cleanly from a
headless server.

Users save any number of named keys. The active key's plaintext is copied
into `os.environ["ANTHROPIC_API_KEY"]` so `agent.agent._run_with_sdk`
picks it up on the very next chat request. All keys (plus which one is
active) live in `backend/.keys.json` with mode 0600.

Endpoints:
  GET    /api/auth/status                  — overall state + active key name
  GET    /api/auth/keys                    — list (key material masked)
  POST   /api/auth/keys                    — create (validates against API)
  POST   /api/auth/keys/{id}/activate      — switch active key
  DELETE /api/auth/keys/{id}               — remove (clears active if matched)
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_KEYS_FILE = _BACKEND_DIR / ".keys.json"
_ENV_FILE = _BACKEND_DIR / ".env"


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------
def _new_id() -> str:
    return "k_" + secrets.token_hex(6)


def _empty_store() -> dict:
    return {"keys": [], "active_id": None}


def _load_store() -> dict:
    if not _KEYS_FILE.exists():
        return _empty_store()
    try:
        data = json.loads(_KEYS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_store()
        data.setdefault("keys", [])
        data.setdefault("active_id", None)
        return data
    except Exception:
        return _empty_store()


def _save_store(data: dict) -> None:
    tmp = _KEYS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, _KEYS_FILE)
    try:
        os.chmod(_KEYS_FILE, 0o600)
    except OSError:
        pass


def _find(data: dict, key_id: str) -> dict | None:
    for k in data["keys"]:
        if k["id"] == key_id:
            return k
    return None


def _mask(api_key: str) -> str:
    if len(api_key) <= 12:
        return "*" * len(api_key)
    return f"{api_key[:7]}…{api_key[-4:]}"


def _public(k: dict, active_id: str | None) -> dict:
    return {
        "id": k["id"],
        "name": k["name"],
        "masked": _mask(k["api_key"]),
        "created_at": k["created_at"],
        "active": k["id"] == active_id,
    }


# ---------------------------------------------------------------------------
# Activation — also updates os.environ so the agent picks up new key instantly
# ---------------------------------------------------------------------------
def _apply_active(data: dict) -> None:
    active_id = data.get("active_id")
    if not active_id:
        os.environ.pop("ANTHROPIC_API_KEY", None)
        return
    k = _find(data, active_id)
    if not k:
        data["active_id"] = None
        os.environ.pop("ANTHROPIC_API_KEY", None)
        return
    os.environ["ANTHROPIC_API_KEY"] = k["api_key"]


def load_active_key_on_startup() -> None:
    """Called from main.py's lifespan. Also migrates legacy .env files."""
    data = _load_store()

    # migrate: old deployments wrote ANTHROPIC_API_KEY=... into .env directly.
    # import it under the name "default" on first boot, then stop reading .env.
    if not data["keys"] and _ENV_FILE.exists():
        legacy = _read_env_key("ANTHROPIC_API_KEY")
        if legacy:
            now = int(time.time())
            kid = _new_id()
            data["keys"].append({
                "id": kid,
                "name": "default",
                "api_key": legacy,
                "created_at": now,
            })
            data["active_id"] = kid
            _save_store(data)

    _apply_active(data)


def _read_env_key(name: str) -> str | None:
    if not _ENV_FILE.exists():
        return None
    prefix = f"{name}="
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip().strip('"').strip("'")
    return None


# ---------------------------------------------------------------------------
# Key validation
# ---------------------------------------------------------------------------
async def _validate_api_key(key: str) -> tuple[bool, str | None]:
    """
    Two-stage validation.

    Stage 1 — identity (`models.list`): every real Anthropic key, regardless
    of plan or workspace, can list its own accessible models. Failure here
    means the key is not recognised at all → hard reject.

    Stage 2 — capability (`messages.create` with the actual agent model).
    Best-effort. We try the exact model the agent uses so we catch cases
    like "Admin key can't call messages API" or "no credit left". But we
    DON'T reject for soft failures such as "this workspace doesn't have
    access to claude-sonnet-4" — those keys may still work with the chat
    endpoint's own fallback handling, and rejecting them is a false
    negative on a perfectly good key.
    """
    try:
        import anthropic
    except ImportError:
        return False, "anthropic SDK not installed on server"

    client = anthropic.Anthropic(api_key=key)

    # Stage 1 — must pass
    try:
        await asyncio.to_thread(lambda: client.models.list(limit=1))
    except Exception as e:  # noqa: BLE001
        return False, f"{type(e).__name__}: {str(e)[:250]}"

    # Stage 2 — probe messages.create with the agent's real model
    try:
        await asyncio.to_thread(lambda: client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1,
            messages=[{"role": "user", "content": "."}],
        ))
        return True, None
    except Exception as e:  # noqa: BLE001
        err = f"{type(e).__name__}: {str(e)[:250]}"
        lower = err.lower()
        # Hard rejects — key itself is not usable for chat, no point saving it
        hard = (
            "authentication_error" in lower
            or "invalid x-api-key" in lower
            or "invalid api key" in lower
            or "401" in lower
            or "credit" in lower
            or "billing" in lower
            or "insufficient" in lower
            or "402" in lower
        )
        if hard:
            return False, err
        # Soft — probably a model-access/region/rate-limit hiccup. Accept
        # the key; if the agent truly can't call this model, the chat
        # endpoint's error handler will surface a specific message then.
        return True, None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/status")
async def auth_status(response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"

    data = _load_store()
    _apply_active(data)  # reconcile env with disk in case something drifted
    active_id = data.get("active_id")
    active = _find(data, active_id) if active_id else None

    has_api_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {
        "ready": has_api_key,
        "mode": "api_key" if has_api_key else "none",
        "has_api_key": has_api_key,
        "keys_count": len(data["keys"]),
        "active_id": active_id,
        "active_name": active["name"] if active else None,
    }


@router.get("/keys")
async def list_keys():
    data = _load_store()
    return {
        "active_id": data["active_id"],
        "keys": [_public(k, data["active_id"]) for k in data["keys"]],
    }


class _KeyCreate(BaseModel):
    name: str
    api_key: str
    activate: bool = True


@router.post("/keys")
async def create_key(body: _KeyCreate):
    name = (body.name or "").strip()
    key = (body.api_key or "").strip()
    if not name:
        raise HTTPException(400, {"reason": "empty_name"})
    if not key:
        raise HTTPException(400, {"reason": "empty_key"})
    if not key.startswith("sk-"):
        raise HTTPException(400, {
            "reason": "invalid_format",
            "hint": "Anthropic API 키는 보통 'sk-ant-...' 로 시작합니다.",
        })

    ok, err = await _validate_api_key(key)
    if not ok:
        raise HTTPException(400, {
            "reason": "validation_failed",
            "detail": err,
            "hint": "키가 유효한지 https://console.anthropic.com/settings/keys 에서 확인해 주세요.",
        })

    data = _load_store()

    # prevent duplicate names (shown in UI as the identifier)
    if any(k["name"] == name for k in data["keys"]):
        raise HTTPException(409, {
            "reason": "duplicate_name",
            "hint": f"'{name}' 이름의 키가 이미 있습니다. 다른 이름을 사용하세요.",
        })

    new_key = {
        "id": _new_id(),
        "name": name,
        "api_key": key,
        "created_at": int(time.time()),
    }
    data["keys"].append(new_key)
    # first key auto-activates regardless of flag; otherwise respect body.activate.
    if body.activate or data["active_id"] is None:
        data["active_id"] = new_key["id"]
    _save_store(data)
    _apply_active(data)

    return {
        "ok": True,
        "key": _public(new_key, data["active_id"]),
        "active_id": data["active_id"],
    }


@router.post("/keys/{key_id}/activate")
async def activate_key(key_id: str):
    data = _load_store()
    if not _find(data, key_id):
        raise HTTPException(404, {"reason": "not_found"})
    data["active_id"] = key_id
    _save_store(data)
    _apply_active(data)
    return {"ok": True, "active_id": key_id}


@router.delete("/keys/{key_id}")
async def delete_key(key_id: str):
    data = _load_store()
    if not _find(data, key_id):
        raise HTTPException(404, {"reason": "not_found"})
    data["keys"] = [k for k in data["keys"] if k["id"] != key_id]
    if data["active_id"] == key_id:
        # fall back to another key if one exists, else clear
        data["active_id"] = data["keys"][0]["id"] if data["keys"] else None
    _save_store(data)
    _apply_active(data)
    return {"ok": True, "active_id": data["active_id"]}
