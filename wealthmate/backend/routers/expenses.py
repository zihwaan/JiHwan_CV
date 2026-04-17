"""Expense endpoints: upsert-on-duplicate for (user, month, category)."""
from typing import List, Optional
import aiosqlite
from fastapi import APIRouter, Query
from pydantic import BaseModel

from database import DB_PATH
from models import ExpenseCreate

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


from models import _must_be_month  # type: ignore
from pydantic import Field, field_validator


class _ExpenseRow(BaseModel):
    month: str
    category: str
    amount: int = Field(ge=0)

    @field_validator("month")
    @classmethod
    def _m(cls, v): return _must_be_month(v)


class _BulkBody(BaseModel):
    rows: List[_ExpenseRow]


@router.get("/{user_id}")
async def list_expenses(user_id: str, month: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if month:
            rows = await (await db.execute(
                "SELECT * FROM expenses WHERE user_id = ? AND month = ? ORDER BY category",
                (user_id, month),
            )).fetchall()
        else:
            rows = await (await db.execute(
                "SELECT * FROM expenses WHERE user_id = ? ORDER BY month, category",
                (user_id,),
            )).fetchall()
        return [dict(r) for r in rows]


@router.post("/{user_id}")
async def upsert_expense(user_id: str, body: ExpenseCreate):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO expenses (user_id, month, category, amount) VALUES (?,?,?,?) "
            "ON CONFLICT(user_id, month, category) DO UPDATE SET amount = excluded.amount",
            (user_id, body.month, body.category, body.amount),
        )
        await db.commit()
    return {"ok": True, "month": body.month, "category": body.category, "amount": body.amount}


@router.post("/{user_id}/bulk")
async def bulk_upsert(user_id: str, body: _BulkBody):
    """Upsert many (month, category) rows in one round-trip. Empty/zero
    amounts delete the row — the grid editor uses this to clear cells."""
    async with aiosqlite.connect(DB_PATH) as db:
        for r in body.rows:
            if r.amount and r.amount > 0:
                await db.execute(
                    "INSERT INTO expenses (user_id, month, category, amount) VALUES (?,?,?,?) "
                    "ON CONFLICT(user_id, month, category) DO UPDATE SET amount = excluded.amount",
                    (user_id, r.month, r.category, r.amount),
                )
            else:
                await db.execute(
                    "DELETE FROM expenses WHERE user_id = ? AND month = ? AND category = ?",
                    (user_id, r.month, r.category),
                )
        await db.commit()
    return {"ok": True, "count": len(body.rows)}


@router.get("/{user_id}/summary")
async def monthly_summary(user_id: str, months: int = Query(6, ge=1, le=24)):
    """Returns up to `months` latest months, keyed by month → { category: amount }."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT month, category, amount FROM expenses "
            "WHERE user_id = ? ORDER BY month DESC",
            (user_id,),
        )).fetchall()

    summary = {}
    for r in rows:
        summary.setdefault(r["month"], {})[r["category"]] = r["amount"]

    latest = sorted(summary.keys(), reverse=True)[:months]
    return {m: summary[m] for m in sorted(latest)}
