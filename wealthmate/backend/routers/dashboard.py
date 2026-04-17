"""
Dashboard router — single aggregated read endpoint that the frontend polls
every 5s. All derived metrics (MoM return, goal progress, etc.) are computed
in services.build_user_context so the chat agent can reuse them.
"""
from fastapi import APIRouter, HTTPException

from services import build_user_context

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/{user_id}")
async def get_dashboard(user_id: str):
    try:
        return await build_user_context(user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
