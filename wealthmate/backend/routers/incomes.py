"""
Extra-income endpoints: non-salary inflows (성과급, OPI, 야근수당, 휴가비 등).

Separate from `expenses` because:
  - Multiple entries per month are normal (성과급 + OPI 같이 지급)
  - They're labeled, not categorized — no fixed enum
  - They feed the true net-worth trajectory alongside the fixed salary

The fixed monthly salary stays on `users.salary` (single scalar).
"""
from typing import Optional
import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import DB_PATH

router = APIRouter(prefix="/api/incomes", tags=["incomes"])


class IncomeCreate(BaseModel):
    month: str      # YYYY-MM
    label: str
    amount: int


@router.get("/{user_id}")
async def list_incomes(user_id: str, month: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if month:
            rows = await (await db.execute(
                "SELECT * FROM incomes WHERE user_id = ? AND month = ? ORDER BY id DESC",
                (user_id, month),
            )).fetchall()
        else:
            rows = await (await db.execute(
                "SELECT * FROM incomes WHERE user_id = ? ORDER BY month DESC, id DESC",
                (user_id,),
            )).fetchall()
    return [dict(r) for r in rows]


@router.post("/{user_id}")
async def add_income(user_id: str, body: IncomeCreate):
    label = (body.label or "").strip()
    if not label:
        raise HTTPException(400, {"reason": "empty_label"})
    if body.amount <= 0:
        raise HTTPException(400, {"reason": "non_positive_amount"})

    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO incomes (user_id, month, label, amount) VALUES (?,?,?,?)",
            (user_id, body.month, label, body.amount),
        )
        await db.commit()
        return {"id": cur.lastrowid, "month": body.month, "label": label, "amount": body.amount}


@router.delete("/{user_id}/{income_id}")
async def delete_income(user_id: str, income_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM incomes WHERE user_id = ? AND id = ?",
            (user_id, income_id),
        )
        await db.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, {"reason": "not_found"})
    return {"ok": True}


@router.get("/{user_id}/summary")
async def income_summary(user_id: str):
    """Per-month total of extra income + a rolling 12m total."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT month, SUM(amount) AS s FROM incomes WHERE user_id = ? "
            "GROUP BY month ORDER BY month",
            (user_id,),
        )).fetchall()
    by_month = {r["month"]: r["s"] or 0 for r in rows}
    total = sum(by_month.values())
    return {"by_month": by_month, "total": total}
