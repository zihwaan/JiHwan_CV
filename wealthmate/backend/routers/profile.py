"""User profile read/update."""
import aiosqlite
from fastapi import APIRouter, HTTPException

from database import DB_PATH
from models import ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/{user_id}")
async def get_profile(user_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await (await db.execute(
            "SELECT id, name, department, salary, join_year FROM users WHERE id = ?",
            (user_id,),
        )).fetchone()
        if not row:
            raise HTTPException(404, "user not found")
        return dict(row)


@router.put("/{user_id}")
async def update_profile(user_id: str, body: ProfileUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "no fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    params = list(fields.values()) + [user_id]
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"UPDATE users SET {set_clause} WHERE id = ?",
            params,
        )
        await db.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "user not found")
    return {"ok": True}
