"""
Agent-context introspection endpoint — the RAG window into what the LLM sees.

Returns the exact system prompt that's currently being injected into each
chat turn, plus the structured context it was built from and the computed
rule violations. The frontend uses this to let the user inspect and edit
the agent's "knowledge."
"""
from fastapi import APIRouter, HTTPException

from services import build_user_context
from agent.prompts import build_system_prompt, check_violations
from agent.tools import TOOLS

router = APIRouter(prefix="/api/context", tags=["context"])


@router.get("/{user_id}")
async def get_agent_context(user_id: str):
    try:
        ctx = await build_user_context(user_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    ctx["rule_violations"] = check_violations(ctx)
    system_prompt = build_system_prompt(ctx)

    return {
        "system_prompt": system_prompt,
        "rule_violations": ctx["rule_violations"],
        "tools": [
            {"name": t["name"], "description": t["description"]}
            for t in TOOLS
        ],
        "profile": ctx["profile"],
        "goal": ctx["goal"],
        "rules": ctx["rules"],
        "assets_count": len(ctx["assets"]),
        "months_of_expenses": len(ctx["expenses_by_month"]),
    }
