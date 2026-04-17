"""
Lifecycle endpoints: fresh-setup wizard, full export, reset.

These exist so WealthMate can be handed to a brand-new user (not just the
hard-coded 변지환 demo). The onboarding wizard commits the user's first
profile + goal + initial assets in one atomic request. Export gives data
portability. Reset erases everything for the user so they can start over.
"""
from __future__ import annotations

from typing import List, Optional

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from database import DB_PATH
from models import _must_be_month  # type: ignore

router = APIRouter(prefix="/api/manage", tags=["manage"])


# Samsung-임직원 기본 룰 5종. Wizard 가 rules 를 전달하지 않으면 이게 꽂힌다.
DEFAULT_RULES = [
    "월 실수령액의 40% 이상을 저축/투자에 배분한다",
    "비유동 자산 비율은 전체 자산의 30~50%로 유지한다",
    "단일 종목 비중은 포트폴리오의 30%를 초과하지 않는다",
    "긴급자금은 월 생활비 3개월치 이상 유동 자산으로 유지한다",
    "해외 자산 비중은 20~40% 수준으로 분산 유지한다",
]


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
class InitialAsset(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    type: str = Field(min_length=1, max_length=30)
    category: str                # 유동 | 비유동
    amount: int = Field(ge=0)
    return_rate: float = 0.0

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in ("유동", "비유동"):
            raise ValueError("category must be '유동' or '비유동'")
        return v


class SetupBody(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    department: Optional[str] = Field(default=None, max_length=40)
    salary: int = Field(ge=0)
    join_year: Optional[int] = Field(default=None, ge=1970, le=2100)
    target_amount: int = Field(ge=0)
    target_year: int = Field(ge=2000, le=2100)
    start_amount: int = Field(default=0, ge=0)
    start_date: Optional[str] = None
    starting_assets: List[InitialAsset] = []
    rules: Optional[List[str]] = None

    @field_validator("start_date")
    @classmethod
    def _sd(cls, v): return _must_be_month(v)


@router.post("/setup/{user_id}")
async def setup(user_id: str, body: SetupBody):
    """Idempotent fresh-start: wipe this user's existing data and commit
    the wizard-provided profile, goal, assets, and rules in one go."""
    rules = body.rules if body.rules is not None else DEFAULT_RULES

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM assets   WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM expenses WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM incomes  WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM goals    WHERE user_id = ?", (user_id,))
        await db.execute(
            "DELETE FROM rules WHERE user_id = ?", (user_id,))

        # upsert user
        await db.execute(
            "INSERT INTO users (id, name, department, salary, join_year) "
            "VALUES (?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET "
            "name = excluded.name, department = excluded.department, "
            "salary = excluded.salary, join_year = excluded.join_year",
            (user_id, body.name, body.department, body.salary, body.join_year),
        )

        for a in body.starting_assets:
            await db.execute(
                "INSERT INTO assets (user_id, name, type, category, amount, return_rate) "
                "VALUES (?,?,?,?,?,?)",
                (user_id, a.name, a.type, a.category, a.amount, a.return_rate),
            )

        await db.execute(
            "INSERT INTO goals (user_id, target_amount, target_year, start_amount, start_date) "
            "VALUES (?,?,?,?,?)",
            (user_id, body.target_amount, body.target_year,
             body.start_amount, body.start_date),
        )

        for r in rules:
            r = (r or "").strip()
            if r:
                await db.execute(
                    "INSERT INTO rules (content, user_id) VALUES (?, ?)",
                    (r, user_id),
                )

        await db.commit()

    return {"ok": True, "user_id": user_id, "rules": rules}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
async def _fetch(db, q: str, params=()):
    db.row_factory = aiosqlite.Row
    return [dict(r) for r in await (await db.execute(q, params)).fetchall()]


@router.get("/export/{user_id}")
async def export_data(user_id: str):
    """Return everything we know about the user as a single JSON. Handy
    for backups, or to move a user across deployments."""
    async with aiosqlite.connect(DB_PATH) as db:
        user   = await _fetch(db, "SELECT * FROM users   WHERE id      = ?", (user_id,))
        assets = await _fetch(db, "SELECT * FROM assets  WHERE user_id = ?", (user_id,))
        exp    = await _fetch(db, "SELECT * FROM expenses WHERE user_id = ?", (user_id,))
        inc    = await _fetch(db, "SELECT * FROM incomes  WHERE user_id = ?", (user_id,))
        goals  = await _fetch(db, "SELECT * FROM goals    WHERE user_id = ?", (user_id,))
        rules  = await _fetch(db, "SELECT * FROM rules    WHERE user_id = ? OR user_id IS NULL", (user_id,))

    if not user:
        raise HTTPException(404, {"reason": "user_not_found"})

    import time
    return {
        "schema_version": 1,
        "exported_at": int(time.time()),
        "user_id": user_id,
        "user": user[0] if user else None,
        "assets": assets,
        "expenses": exp,
        "incomes": inc,
        "goals": goals,
        "rules": rules,
    }


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------
class ResetBody(BaseModel):
    # Safety belt: client must echo the user_id back to prove it's not an
    # accidental click. UI gate already confirms, this is the second belt.
    confirm: str


@router.post("/reset/{user_id}")
async def reset_data(user_id: str, body: ResetBody):
    if body.confirm != user_id:
        raise HTTPException(400, {
            "reason": "confirm_mismatch",
            "hint": "confirm 필드는 user_id 와 동일해야 합니다.",
        })

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM assets   WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM expenses WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM incomes  WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM goals    WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM rules    WHERE user_id = ?", (user_id,))
        # keep the users row so the dashboard endpoint still works; blank its
        # fields so onboarding triggers on next load.
        await db.execute(
            "UPDATE users SET name='', department='', salary=0, join_year=NULL WHERE id=?",
            (user_id,),
        )
        # if no users row at all, insert a blank so dashboard doesn't 404.
        row = await (await db.execute(
            "SELECT id FROM users WHERE id = ?", (user_id,)
        )).fetchone()
        if not row:
            await db.execute(
                "INSERT INTO users (id, name, department, salary, join_year) "
                "VALUES (?, '', '', 0, NULL)",
                (user_id,),
            )
        await db.commit()

    return {"ok": True, "user_id": user_id}
