"""Chat endpoint — thin wrapper around agent.run_agent."""
import traceback
from fastapi import APIRouter, HTTPException

from models import ChatRequest, ChatResponse
from agent.agent import run_agent

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest):
    try:
        result = await run_agent(body.user_id, body.message)
        return ChatResponse(reply=result["reply"], action=result.get("action"))
    except Exception as e:
        # Log full traceback server-side; surface a clean message to the UI so
        # the user can distinguish "no key" vs "key has no credit" vs code bug.
        traceback.print_exc()
        raw = str(e) or "unknown"
        name = type(e).__name__
        # heuristics so the banner's error hint actually points at the fix
        lower = raw.lower()
        if "authentication" in lower or "invalid x-api-key" in lower or "401" in lower:
            hint = ("활성 API Key 가 Anthropic 에서 인증에 실패했습니다. "
                    "배너에서 새 키로 교체하거나, Console 에서 해당 키가 유효한지 확인하세요.")
        elif "credit" in lower or "billing" in lower or "insufficient" in lower or "402" in lower:
            hint = ("이 키가 속한 organization 의 크레딧이 부족합니다. "
                    "console.anthropic.com 에서 결제/크레딧을 확인하거나 다른 키로 교체하세요.")
        elif "permission" in lower or "scope" in lower or "403" in lower:
            hint = ("이 키는 messages API 호출 권한이 없습니다 (Admin/Workspace 전용 키일 수 있음). "
                    "Workbench API key 로 교체하세요.")
        elif "rate limit" in lower or "429" in lower:
            hint = "레이트 리밋에 걸렸습니다. 잠시 후 다시 시도하세요."
        else:
            hint = ("활성 API Key 문제로 채팅이 실패했습니다. "
                    "배너에서 키 상태 확인 또는 교체 후 다시 시도하세요.")
        raise HTTPException(503, {
            "error": name,
            "message": raw[:400],
            "hint": hint,
        })
