"""
Agent loop — single entrypoint `run_agent(user_id, message)`.

Two authentication paths, picked at import time:

1. ANTHROPIC_API_KEY set → use the Anthropic Python SDK directly
   (real function-calling loop, up to 5 iterations).
2. Otherwise → shell out to the `claude` CLI (uses your logged-in
   Claude account, no API key needed). In this mode we do a manual
   two-step: (a) ask Claude to pick a tool + args as JSON,
   (b) execute the tool in Python, (c) ask Claude to craft the
   natural-language reply using the tool result.

Both paths return the same shape:
    {"reply": "<final text>", "action": {"type": tool, "result": str} | None}
"""
from __future__ import annotations

import json
import os
import asyncio
import shutil
import subprocess

from services import build_user_context
from agent.tools import TOOLS, execute_tool
from agent.prompts import build_system_prompt, check_violations


MODEL_SDK = "claude-sonnet-4-20250514"
MODEL_CLI = "sonnet"
MAX_ITERATIONS = 5


def _have_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _have_claude_cli() -> bool:
    return shutil.which("claude") is not None


async def run_agent(user_id: str, message: str) -> dict:
    context = await build_user_context(user_id)
    context["rule_violations"] = check_violations(context)
    system_prompt = build_system_prompt(context)

    if _have_api_key():
        return await _run_with_sdk(user_id, message, system_prompt)
    if _have_claude_cli():
        return await _run_with_cli(user_id, message, system_prompt)
    return {
        "reply": "(에이전트 사용 불가: ANTHROPIC_API_KEY 미설정이고 `claude` CLI도 없습니다. "
                 "README의 '에이전트 인증' 섹션을 참고하세요.)",
        "action": None,
    }


# ---------------------------------------------------------------------------
# Path 1: Anthropic SDK with real function calling
# ---------------------------------------------------------------------------

async def _run_with_sdk(user_id: str, message: str, system_prompt: str) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    messages = [{"role": "user", "content": message}]
    last_action = None
    final_text_parts = []

    for _ in range(MAX_ITERATIONS):
        response = client.messages.create(
            model=MODEL_SDK,
            max_tokens=1024,
            system=system_prompt,
            tools=TOOLS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        text_this_turn = []
        tool_uses = []
        for block in response.content:
            if getattr(block, "type", None) == "text":
                text_this_turn.append(block.text)
            elif getattr(block, "type", None) == "tool_use":
                tool_uses.append(block)

        if text_this_turn:
            final_text_parts = text_this_turn

        if response.stop_reason == "end_turn" or not tool_uses:
            break

        tool_results = []
        for tu in tool_uses:
            result_str = await execute_tool(tu.name, user_id, tu.input or {})
            last_action = {"type": tu.name, "result": result_str}
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu.id,
                "content": result_str,
            })
        messages.append({"role": "user", "content": tool_results})

    reply = "\n".join(p.strip() for p in final_text_parts if p and p.strip())
    return {"reply": reply or "(응답을 생성하지 못했습니다.)", "action": last_action}


# ---------------------------------------------------------------------------
# Path 2: Claude CLI subprocess — uses the user's logged-in Claude account
# ---------------------------------------------------------------------------

def _tools_description_for_cli() -> str:
    """Render the 4 tools in a compact form for prompting."""
    lines = []
    for t in TOOLS:
        lines.append(f"- {t['name']}: {t['description']}")
        props = t["input_schema"].get("properties", {})
        if props:
            args = ", ".join(f"{k}({v.get('type','?')})" for k, v in props.items())
            lines.append(f"  args: {args}")
    return "\n".join(lines)


def _run_claude_cli_sync(system_prompt: str, user_text: str) -> str:
    """Blocking `claude -p ...` invocation. Called via asyncio.to_thread.

    We use subprocess.run here (not asyncio.create_subprocess_exec) because
    on Windows the uvicorn default event loop is SelectorEventLoop, which
    raises NotImplementedError for subprocess_exec. subprocess.run works
    regardless of event loop, at the cost of running in a thread."""
    claude_path = shutil.which("claude") or "claude"
    result = subprocess.run(
        [
            claude_path, "-p",
            "--tools", "",
            "--model", MODEL_CLI,
            "--output-format", "json",
            "--system-prompt", system_prompt,
            user_text,
        ],
        capture_output=True,
        text=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI failed ({result.returncode}): "
            f"{result.stderr.decode(errors='ignore')[:500]}"
        )
    stdout = result.stdout.decode(errors="ignore")
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return stdout.strip()
    return (data.get("result") or "").strip()


async def _call_claude_cli(system_prompt: str, user_text: str) -> str:
    """Run `claude -p ...` and return the text result field."""
    return await asyncio.to_thread(_run_claude_cli_sync, system_prompt, user_text)


def _extract_json(text: str) -> dict | None:
    """Best-effort JSON extraction from model output."""
    if not text:
        return None
    # strip code fences
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.startswith("json"):
            t = t[4:]
        t = t.strip()
    # find first { ... last }
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(t[start:end + 1])
    except json.JSONDecodeError:
        return None


async def _run_with_cli(user_id: str, message: str, system_prompt: str) -> dict:
    # Step 1 — planner: decide if a tool is needed, return strict JSON.
    planner_system = (
        system_prompt
        + "\n\n## 중요 — 당신은 지금 '플래너' 역할입니다.\n"
        + "JSON 한 개만 반환하세요. 다른 텍스트·마크다운·설명 금지.\n\n"
        + "사용 가능한 도구:\n"
        + _tools_description_for_cli()
        + "\n\n"
        + "출력 형식:\n"
        + '- 도구 필요: {"tool": "<tool_name>", "args": {...}}\n'
        + '- 도구 불필요 (단순 인사/잡담만): {"tool": null, "reply": "<한국어 응답>"}\n\n'
        + "강제 규칙 (반드시 지킬 것):\n"
        + "1. 오늘 날짜는 2026-04-17. '이번달'=2026-04, '지난달'=2026-03.\n"
        + "2. 사용자가 지출/자산을 **기록·추가·수정·삭제·변경**하려는 의도면 반드시 tool을 호출하세요. 절대 `tool: null` 로 '완료했다'고 거짓말하지 마세요.\n"
        + "3. 자산 금액 변경·자산 추가·자산 삭제는 upsert_asset 또는 delete_asset 로만 처리하세요 (직접 응답 금지).\n"
        + "4. 기존 자산의 금액만 바꿀 때는 name과 amount만 넘기면 됩니다 (type/category 생략 가능).\n"
        + "5. 조회·분석·요약 질문이면 해당하는 read-tool (get_monthly_summary, calc_trend, check_goal, list_assets) 중 하나를 호출하세요.\n"
        + "6. tool:null 은 오직 인사/잡담/순수 의견 질문일 때만 허용됩니다.\n"
    )

    plan_raw = await _call_claude_cli(planner_system, message)
    plan = _extract_json(plan_raw)

    last_action = None
    tool_result_text = None

    if plan and plan.get("tool"):
        tool_name = plan["tool"]
        args = plan.get("args") or {}
        try:
            tool_result_text = await execute_tool(tool_name, user_id, args)
            last_action = {"type": tool_name, "result": tool_result_text}
        except Exception as e:
            tool_result_text = f"(도구 실행 중 오류: {e})"
            last_action = {"type": tool_name, "result": tool_result_text}
    elif plan and "reply" in plan and not plan.get("tool"):
        # No tool needed — just use the reply directly.
        return {"reply": plan["reply"], "action": None}

    # Step 2 — responder: craft final natural-language reply.
    if tool_result_text is not None:
        responder_prompt = (
            f"사용자 메시지: {message}\n\n"
            f"방금 실행한 도구 '{last_action['type']}'의 결과:\n{tool_result_text}\n\n"
            f"위 결과를 바탕으로 사용자에게 자연스럽게 한국어로 응답하세요. "
            f"숫자는 콤마 표기하고, 규칙 위반이 있으면 답변 말미에 자연스럽게 언급하세요."
        )
    else:
        # Planner didn't give JSON at all — treat the raw planner output as the reply.
        if plan_raw and not plan:
            return {"reply": plan_raw, "action": None}
        responder_prompt = message

    final = await _call_claude_cli(system_prompt, responder_prompt)
    return {"reply": final or "(응답을 생성하지 못했습니다.)", "action": last_action}
