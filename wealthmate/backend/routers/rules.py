"""
Rules CRUD — the 'R' in RAG.

Rules stored with user_id IS NULL are global; rules with a user_id are
per-user overrides/additions. Both are injected into the agent's system
prompt, so editing them here changes the agent's behavior on the next
chat turn.
"""
import aiosqlite
from fastapi import APIRouter, HTTPException

from database import DB_PATH
from models import RuleCreate, RuleUpdate

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("/{user_id}")
async def list_rules(user_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT id, content, user_id FROM rules "
            "WHERE user_id IS NULL OR user_id = ? ORDER BY id",
            (user_id,),
        )).fetchall()
        return [
            {"id": r["id"], "content": r["content"],
             "scope": "global" if r["user_id"] is None else "user"}
            for r in rows
        ]


@router.post("/{user_id}")
async def create_rule(user_id: str, body: RuleCreate):
    if not body.content.strip():
        raise HTTPException(400, "content is empty")
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO rules (content, user_id) VALUES (?, ?)",
            (body.content.strip(), user_id),
        )
        await db.commit()
        return {"id": cur.lastrowid, "content": body.content.strip(), "scope": "user"}


@router.put("/{user_id}/{rule_id}")
async def update_rule(user_id: str, rule_id: int, body: RuleUpdate):
    if not body.content.strip():
        raise HTTPException(400, "content is empty")
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "UPDATE rules SET content = ? WHERE id = ? "
            "AND (user_id IS NULL OR user_id = ?)",
            (body.content.strip(), rule_id, user_id),
        )
        await db.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "rule not found")
    return {"ok": True, "id": rule_id}


@router.delete("/{user_id}/{rule_id}")
async def delete_rule(user_id: str, rule_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "DELETE FROM rules WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
            (rule_id, user_id),
        )
        await db.commit()
        if cur.rowcount == 0:
            raise HTTPException(404, "rule not found")
    return {"ok": True, "id": rule_id}
