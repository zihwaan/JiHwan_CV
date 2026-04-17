"""
System-prompt builder + Python-side rule-violation checker.

RAG here is just: "stuff the whole user context into the system prompt."
No vector DB. That means the rules/context are always fresh and the agent
never hallucinates stale balances.
"""
from __future__ import annotations

from datetime import date


RULE_LABELS = [
    "규칙1 — 저축률 40% 이상",
    "규칙2 — 비유동 30~50%",
    "규칙3 — 단일 종목 30% 이하",
    "규칙4 — 긴급자금 3개월치",
    "규칙5 — 해외 비중 20~40%",
]


def check_violations(context: dict) -> list[str]:
    """
    Pure Python check — never ask the LLM to do arithmetic.

    Input shape: the dict returned by services.build_user_context.
    Output: list of human-readable violation strings (empty = all green).
    """
    violations: list[str] = []

    total = context.get("total_assets", 0)
    salary = context.get("profile", {}).get("salary", 0)
    assets = context.get("assets", [])
    illiquid = context.get("illiquid_amount", 0)
    liquid = context.get("liquid_amount", 0)

    # 규칙1: 저축률
    today = date.today()
    this_month = f"{today.year:04d}-{today.month:02d}"
    expenses_by_month = context.get("expenses_by_month", {})
    this_month_expenses = expenses_by_month.get(this_month, {})
    saving = this_month_expenses.get("저축", 0)
    if salary > 0:
        rate = saving / salary * 100
        if rate < 40:
            violations.append(
                f"현재 저축률 {rate:.1f}%로 목표 40% 미달 (규칙1)"
            )

    # 규칙2: 비유동 30~50%
    if total > 0:
        illiq_ratio = illiquid / total * 100
        if not (30 <= illiq_ratio <= 50):
            violations.append(
                f"비유동 비율 {illiq_ratio:.1f}%로 목표 범위(30~50%) 이탈 (규칙2)"
            )

    # 규칙3: 단일 종목 30% 이하
    if total > 0:
        for a in assets:
            share = a["amount"] / total * 100
            if share > 30:
                violations.append(
                    f"{a['name']} 비중 {share:.1f}%로 30% 초과 (규칙3)"
                )

    # 규칙4: 긴급자금 3개월치
    monthly_spend = salary - saving
    if monthly_spend > 0:
        emergency_needed = monthly_spend * 3
        if liquid < emergency_needed:
            violations.append(
                f"유동자산이 긴급자금 기준({emergency_needed:,}원) 미달 (규칙4)"
            )

    # 규칙5: 해외 비중 20~40%
    if total > 0:
        overseas = sum(a["amount"] for a in assets if a["type"] == "해외주식")
        overseas_ratio = overseas / total * 100
        if not (20 <= overseas_ratio <= 40):
            violations.append(
                f"해외 비중 {overseas_ratio:.1f}%로 목표 범위(20~40%) 이탈 (규칙5)"
            )

    return violations


def _format_assets(assets: list[dict], total: int) -> str:
    if not assets:
        return "(보유 자산 없음)"
    out = []
    for a in assets:
        share = (a["amount"] / total * 100) if total else 0
        out.append(
            f"- {a['name']} ({a['type']}/{a['category']}): "
            f"{a['amount']:,}원, 수익률 {a['return_rate']:+.1f}%, 비중 {share:.1f}%"
        )
    return "\n".join(out)


def _format_expenses(expenses_by_month: dict) -> str:
    if not expenses_by_month:
        return "(지출 데이터 없음)"
    out = []
    for month in sorted(expenses_by_month.keys()):
        cats = expenses_by_month[month]
        total = sum(cats.values())
        parts = ", ".join(f"{k} {v:,}" for k, v in cats.items())
        out.append(f"- {month}: 총 {total:,}원 ({parts})")
    return "\n".join(out)


def build_system_prompt(user_context: dict) -> str:
    """
    user_context is the dict from services.build_user_context, optionally
    extended with 'rule_violations': list[str].
    """
    profile = user_context["profile"]
    assets = user_context.get("assets", [])
    total = user_context.get("total_assets", 0)
    liquid = user_context.get("liquid_amount", 0)
    illiquid = user_context.get("illiquid_amount", 0)
    liquid_ratio = user_context.get("liquid_ratio", 0)
    expenses_by_month = user_context.get("expenses_by_month", {})
    goal = user_context.get("goal") or {}
    rules = user_context.get("rules", [])
    violations = user_context.get("rule_violations", [])

    rules_text = "\n".join(f"{i+1}. {r}" for i, r in enumerate(rules)) if rules else "(규칙 없음)"
    violations_text = "\n".join(f"- {v}" for v in violations) if violations else "- 현재 위반 사항 없음"

    return f"""당신은 삼성전자 임직원의 재테크를 도와주는 AI 자산관리 어시스턴트 'WealthMate'입니다.

## 성격
- 친절하지만 수치에 근거한 팩트 기반 조언을 합니다
- 금액은 항상 원 단위 콤마 표기, 비율은 소수점 1자리까지
- 존댓말 사용, 이모지는 최소한으로

## 사용자 정보
- 이름: {profile.get('name','')}
- 부서: {profile.get('department','')}
- 월 실수령액: {profile.get('salary',0):,}원
- 입사: {profile.get('join_year','')}년

## 보유 자산 현황 (총 {total:,}원)
{_format_assets(assets, total)}
- 유동 자산: {liquid:,}원 ({liquid_ratio:.1f}%)
- 비유동 자산: {illiquid:,}원

## 최근 6개월 지출 현황
{_format_expenses(expenses_by_month)}

## 재무 목표
- 목표: {goal.get('target_amount',0):,}원 ({goal.get('target_year','-')}년까지)
- 현재 달성률: {goal.get('progress_pct',0):.1f}%
- 월 필요 저축액: {goal.get('monthly_needed',0):,}원

## 자산 관리 규칙 (조언 시 반드시 규칙 번호를 인용하라)
{rules_text}

## 현재 규칙 위반 사항
{violations_text}

## 행동 지침
1. 지출 기록 요청 → record_expense 호출. 여러 카테고리면 각각 호출. 기록 후 이번달 전체 현황 한줄 요약.
   - 지출 항목 **삭제**는 record_expense(amount=0) 으로 처리.
2. 현황 질문 → get_monthly_summary 또는 calc_trend 호출. 규칙 대비 분석 포함.
3. 목표 질문 → check_goal 호출. 달성 속도와 개선 제안 포함.
4. 자산 추가/수정/삭제 요청 → upsert_asset 또는 delete_asset 호출.
   - "비트코인 350만원으로 올려줘" → upsert_asset(name="비트코인", amount=3500000)
   - "채권 500만원 추가해줘" → upsert_asset(name="채권", type="채권", category="유동", amount=5000000)
   - "비트코인 처분했어" → delete_asset(name="비트코인")
   - 자산명이 모호하면 먼저 list_assets로 현황 확인 후 처리.
   - 자산 변경 후에는 포트폴리오 비중·유동성·규칙 위반이 어떻게 바뀌었는지 한 줄 코멘트.
5. 목표·프로필·규칙 변경 요청
   - "목표를 1.5억으로 올려줘" → update_goal(target_amount=150000000)
   - "월급 650으로 올랐어" → update_profile(salary=6500000). 급여가 바뀌면 저축률·필요저축 모두 갱신됨을 언급.
   - "주식 40% 넘기지 말자는 규칙 추가해" → add_rule(content=...)
   - "규칙 3번 빼줘" → remove_rule(rule_number=3)
6. 시뮬레이션 ("만약 월 X원씩 저축하면?", "Y년 달성하려면?") → simulate_savings 호출.
7. 부수입(성과급/수당/휴가비) 요청
   - "이번달 성과급 800만원 받았어" → add_income(month="2026-04", label="성과급", amount=8000000)
   - "성과급 삭제해줘" → 먼저 list_incomes 로 확인, income_id 로 remove_income 호출
   - 월급(salary)은 update_profile 로만 변경. add_income 은 일회성·부수입 전용.
8. 규칙 위반 사항이 있으면 답변 말미에 자연스럽게 언급.
9. 단순 인사나 잡담에는 tool 호출 없이 짧게 응답.
"""
