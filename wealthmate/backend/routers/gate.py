"""
Access-PIN gate for the whole WealthMate API.

Why: every /api/* route exposes financial data and the Anthropic key store.
Without a gate, anyone who knows the URL can read/write everything. For a
personal deployment a shared-secret PIN is enough — not cryptographic
identity, just "don't let the entire internet poke this."

Behaviour:
  - If env var `WEALTHMATE_ACCESS_PIN` is unset → gate is OFF (local dev).
  - If set → every request under /api/* that isn't /api/auth/gate_status
    must carry `x-wm-pin: <PIN>`. Missing/wrong → 401 with a hint.
  - The `/api/auth/gate_status` endpoint always returns public info so
    the frontend can decide whether to prompt for a PIN.

Frontend stores the PIN in localStorage once and sends it on every axios
request via an interceptor. See `src/api.js`.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse


_EXEMPT_PATHS = {
    "/",                              # health probe
    "/api/auth/gate_status",          # gate probe
    "/openapi.json",
    "/docs",
    "/redoc",
    "/favicon.ico",
}


def _load_env_file() -> None:
    """Minimal dotenv loader — reads backend/.env without a new dep."""
    env_file = Path(__file__).resolve().parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def _current_pin() -> str | None:
    return os.environ.get("WEALTHMATE_ACCESS_PIN") or None


async def gate_middleware(request: Request, call_next):
    """ASGI middleware — checks x-wm-pin before handlers run."""
    expected = _current_pin()
    path = request.url.path

    # no PIN configured → gate is disabled (local dev / trusted env)
    if not expected:
        return await call_next(request)

    # exempt probes + gate_status + docs
    if path in _EXEMPT_PATHS or path.startswith("/docs/") or path.startswith("/redoc/"):
        return await call_next(request)
    # only protect /api/*
    if not path.startswith("/api/"):
        return await call_next(request)

    provided = request.headers.get("x-wm-pin") or ""
    # constant-time compare to avoid timing-side-channel silliness
    import hmac
    if not hmac.compare_digest(provided, expected):
        return JSONResponse(
            status_code=401,
            headers={"x-wm-pin-required": "true"},
            content={
                "detail": {
                    "reason": "pin_required" if not provided else "pin_mismatch",
                    "hint": "WealthMate 는 접근 PIN 이 필요합니다. 배너에서 PIN 을 입력하세요.",
                },
            },
        )
    return await call_next(request)


from fastapi import APIRouter
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/gate_status")
async def gate_status(request: Request):
    expected = _current_pin()
    provided = request.headers.get("x-wm-pin") or ""
    import hmac
    ok = bool(expected and hmac.compare_digest(provided, expected))
    return {
        "required": bool(expected),
        "ok": ok if expected else True,
    }
