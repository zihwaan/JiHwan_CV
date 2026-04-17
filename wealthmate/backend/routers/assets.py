"""Asset CRUD endpoints."""
import aiosqlite
from fastapi import APIRouter, HTTPException

from database import DB_PATH
from models import AssetCreate, AssetUpdate

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/{user_id}")
async def list_assets(user_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT * FROM assets WHERE user_id = ? ORDER BY amount DESC",
            (user_id,),
        )).fetchall()
        return [dict(r) for r in rows]


@router.post("/{user_id}")
async def create_asset(user_id: str, body: AssetCreate):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO assets (user_id, name, type, category, amount, return_rate) "
            "VALUES (?,?,?,?,?,?)",
            (user_id, body.name, body.type, body.category, body.amount, body.return_rate),
        )
        await db.commit()
        return {"id": cur.lastrowid, "user_id": user_id, **body.model_dump()}


@router.put("/{user_id}/{asset_id}")
async def update_asset(user_id: str, asset_id: int, body: AssetUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "no fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    params = list(fields.values()) + [user_id, asset_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE assets SET {set_clause}, updated_at = datetime('now','localtime') "
            f"WHERE user_id = ? AND id = ?",
            params,
        )
        await db.commit()
    return {"ok": True, "id": asset_id}


@router.delete("/{user_id}/{asset_id}")
async def delete_asset(user_id: str, asset_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM assets WHERE user_id = ? AND id = ?",
            (user_id, asset_id),
        )
        await db.commit()
    return {"ok": True, "id": asset_id}
