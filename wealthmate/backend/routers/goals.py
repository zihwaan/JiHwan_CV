"""Goal endpoints."""
import aiosqlite
from fastapi import APIRouter, HTTPException

from database import DB_PATH
from models import GoalUpdate

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.get("/{user_id}")
async def get_goal(user_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT * FROM goals WHERE user_id = ?", (user_id,)
        )).fetchone()
        if not row:
            raise HTTPException(404, "goal not found")
        return dict(row)


@router.put("/{user_id}")
async def update_goal(user_id: str, body: GoalUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "no fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    params = list(fields.values()) + [user_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE goals SET {set_clause} WHERE user_id = ?",
            params,
        )
        await db.commit()
    return {"ok": True}
