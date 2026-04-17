"""
Agent tools — function-calling schemas + execute dispatcher.

Each tool:
- declared in TOOLS (Anthropic function-calling schema)
- executed via execute_tool(name, user_id, args) -> human-readable Korean string

Keeping tools thin and DB-direct keeps the agent debuggable: every tool
call corresponds to a single SQL query or a small pure computation.
"""
from __future__ import annotations

from datetime import date
from typing import Union
import aiosqlite

from database import DB_PATH


TOOLS = [
    {
        "name": "record_expense",
        "description": (
            "월별 지출을 카테고리별로 DB에 기록한다. "
            "사용자가 '이번달 식비 42만원 썼어' 같이 말하면 호출한다. "
            "같은 월+카테고리가 이미 있으면 금액을 덮어쓴다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {
                    "type": "string",
                    "description": "YYYY-MM 형식. '이번달'이면 2026-04",
                },
                "category": {
                    "type": "string",
                    "enum": ["식비", "교통", "주거", "쇼핑", "여가", "저축", "기타"],
                },
                "amount": {
                    "type": "integer",
                    "description": "금액(원). '42만원'=420000, '3만5천원'=35000",
                },
            },
            "required": ["month", "category", "amount"],
        },
    },
    {
        "name": "get_monthly_summary",
        "description": (
            "특정 월의 카테고리별 지출 합계, 총지출, 급여대비 저축률, "
            "잔여예산을 조회한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {
                    "type": "string",
                    "description": "YYYY-MM. '이번달'=2026-04, '지난달'=2026-03",
                },
            },
            "required": ["month"],
        },
    },
    {
        "name": "calc_trend",
        "description": (
            "최근 N개월간 특정 카테고리 또는 전체 지출 추이와 평균, "
            "증감률을 계산한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "특정 카테고리명. 생략하면 전체 지출 추이.",
                },
                "months": {
                    "type": "integer",
                    "description": "조회 개월수. 기본 6.",
                    "default": 6,
                },
            },
            "required": [],
        },
    },
    {
        "name": "check_goal",
        "description": (
            "목표 달성률(%), 현재 속도 기준 예상 달성 시점, "
            "목표 연도 내 달성을 위한 월 필요 저축액을 계산한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "upsert_asset",
        "description": (
            "보유 자산을 추가하거나 기존 자산의 금액/수익률을 업데이트한다. "
            "같은 이름의 자산이 이미 있으면 amount/return_rate/category/type을 덮어쓰고, "
            "없으면 새로 추가한다. 사용 예: "
            "'비트코인 350만원으로 올려줘' → name='비트코인', amount=3500000; "
            "'채권 500만원 추가해줘' → name='채권', type='채권', category='유동', amount=5000000."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "자산명 (예: '삼성전자 우리사주', '비트코인', '국민은행 적금')",
                },
                "type": {
                    "type": "string",
                    "enum": ["국내주식", "해외주식", "ETF", "예금", "저축", "가상화폐", "채권", "부동산", "기타"],
                    "description": "자산 유형. 기존 자산 업데이트 시에는 생략 가능.",
                },
                "category": {
                    "type": "string",
                    "enum": ["유동", "비유동"],
                    "description": "유동성 분류. 기존 자산 업데이트 시에는 생략 가능.",
                },
                "amount": {
                    "type": "integer",
                    "description": "평가금액(원). 필수.",
                },
                "return_rate": {
                    "type": "number",
                    "description": "수익률(%). 생략 시 0 또는 기존값 유지.",
                },
            },
            "required": ["name", "amount"],
        },
    },
    {
        "name": "delete_asset",
        "description": (
            "보유 자산을 삭제한다. 자산명으로 매칭한다. "
            "사용 예: '비트코인 처분했어' → name='비트코인'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "삭제할 자산명 (정확히 일치하거나 부분 일치)",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_assets",
        "description": (
            "현재 보유한 모든 자산 목록을 조회한다. "
            "자산명을 확인하거나 수정 전에 현황을 파악할 때 호출한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "update_goal",
        "description": (
            "재무 목표를 수정한다. 목표 금액, 목표 연도, 시작 자산, 시작 일자 중 "
            "주어진 항목만 바꾼다. 예: '목표를 1.5억으로 올려줘' → target_amount=150000000. "
            "'목표 시점을 2030년으로 바꿔줘' → target_year=2030."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "target_amount": {"type": "integer", "description": "목표 금액(원)"},
                "target_year": {"type": "integer", "description": "목표 연도 (예: 2028)"},
                "start_amount": {"type": "integer", "description": "시작 시점 자산(원)"},
                "start_date": {"type": "string", "description": "시작 시점 YYYY-MM"},
            },
            "required": [],
        },
    },
    {
        "name": "update_profile",
        "description": (
            "사용자 프로필을 수정한다. 월 실수령액, 이름, 부서, 입사 연도 중 주어진 값만 "
            "바꾼다. 예: '월급이 650으로 올랐어' → salary=6500000. "
            "급여가 바뀌면 저축률 기준이 즉시 갱신된다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "department": {"type": "string"},
                "salary": {"type": "integer", "description": "월 실수령액(원)"},
                "join_year": {"type": "integer"},
            },
            "required": [],
        },
    },
    {
        "name": "simulate_savings",
        "description": (
            "저축 시뮬레이터. 세 가지 모드:\n"
            "  (a) monthly_saving 만 주면 → 그 속도로 목표까지 몇 개월, ETA 계산\n"
            "  (b) target_year 만 주면 → 그 연도 내 달성에 필요한 월 저축액 계산\n"
            "  (c) 둘 다 주면 → 각각의 ETA/필요 저축과 차이 비교\n"
            "사용 예: '월 300만원씩 저축하면 언제 1억 찍어?' → monthly_saving=3000000."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "monthly_saving": {"type": "integer", "description": "월 저축액(원)"},
                "target_year": {"type": "integer", "description": "목표 달성 희망 연도"},
            },
            "required": [],
        },
    },
    {
        "name": "add_rule",
        "description": (
            "개인 자산 관리 규칙을 추가한다. 추가된 규칙은 다음 채팅부터 시스템 프롬프트에 "
            "주입되어 에이전트 조언에 반영된다. 예: '주식 비중 40% 넘기지 마' → "
            "content='주식 비중은 40%를 초과하지 않는다'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "규칙 문장"},
            },
            "required": ["content"],
        },
    },
    {
        "name": "remove_rule",
        "description": (
            "규칙을 삭제한다. rule_number 는 시스템 프롬프트에 보이는 1부터 시작하는 번호. "
            "없으면 content 부분 일치로도 매칭한다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "rule_number": {"type": "integer", "description": "1부터 시작하는 규칙 번호"},
                "content": {"type": "string", "description": "규칙 내용(부분 일치)"},
            },
            "required": [],
        },
    },
    {
        "name": "add_income",
        "description": (
            "급여 외 부수입(성과급, OPI, TAI, 야근수당, 휴가비 등) 한 건을 기록한다. "
            "월급(users.salary)은 건드리지 않는다. 같은 달에 여러 건 기록 가능. "
            "사용 예: '이번달 성과급 800만원 받았어' → month='2026-04', label='성과급', amount=8000000."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "string", "description": "YYYY-MM"},
                "label": {"type": "string", "description": "성과급/OPI/TAI/야근수당/휴가비 등"},
                "amount": {"type": "integer", "description": "금액(원)"},
            },
            "required": ["month", "label", "amount"],
        },
    },
    {
        "name": "remove_income",
        "description": (
            "기록된 부수입을 삭제한다. income_id 또는 (month, label) 조합으로 매칭. "
            "둘 다 가능하면 income_id 우선. "
            "여러 건 매칭되면 에러를 반환하므로 list_incomes 로 먼저 확인하는 게 안전."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "income_id": {"type": "integer"},
                "month": {"type": "string", "description": "YYYY-MM"},
                "label": {"type": "string"},
            },
            "required": [],
        },
    },
    {
        "name": "list_incomes",
        "description": (
            "지금까지 기록된 모든 부수입을 반환한다. "
            "month 를 지정하면 그 달만. 삭제 전 확인용."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "string", "description": "YYYY-MM (선택)"},
            },
            "required": [],
        },
    },
]


def _fmt(n) -> str:
    return f"{int(round(n)):,}"


async def _get_salary(db, user_id: str) -> int:
    row = await (await db.execute(
        "SELECT salary FROM users WHERE id = ?", (user_id,)
    )).fetchone()
    return row["salary"] if row else 0


async def _tool_record_expense(user_id: str, args: dict) -> str:
    month = args["month"]
    category = args["category"]
    amount = int(args["amount"])

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if amount <= 0:
            # amount=0 → 삭제 시맨틱. bulk endpoint 와 일관성.
            cur = await db.execute(
                "DELETE FROM expenses WHERE user_id = ? AND month = ? AND category = ?",
                (user_id, month, category),
            )
            await db.commit()
            deleted = cur.rowcount
            if not deleted:
                return f"{month} {category} 항목은 이미 없습니다."
            return f"{month} {category} 항목 삭제 완료."

        await db.execute(
            "INSERT INTO expenses (user_id, month, category, amount) VALUES (?,?,?,?) "
            "ON CONFLICT(user_id, month, category) DO UPDATE SET amount = excluded.amount",
            (user_id, month, category, amount),
        )
        await db.commit()

        total_row = await (await db.execute(
            "SELECT SUM(amount) AS s FROM expenses WHERE user_id = ? AND month = ?",
            (user_id, month),
        )).fetchone()
        total = total_row["s"] or 0

    return (
        f"{month} {category} {_fmt(amount)}원 기록 완료. "
        f"이번달 총지출 누적: {_fmt(total)}원"
    )


async def _tool_get_monthly_summary(user_id: str, args: dict) -> str:
    month = args["month"]
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        salary = await _get_salary(db, user_id)
        rows = await (await db.execute(
            "SELECT category, amount FROM expenses WHERE user_id = ? AND month = ? ORDER BY amount DESC",
            (user_id, month),
        )).fetchall()

    if not rows:
        return f"{month} 지출 데이터가 없습니다."

    total = sum(r["amount"] for r in rows)
    saving = next((r["amount"] for r in rows if r["category"] == "저축"), 0)
    saving_rate = (saving / salary * 100) if salary else 0
    remaining = salary - total

    lines = [f"- {r['category']}: {_fmt(r['amount'])}원" for r in rows]
    detail = "\n".join(lines)
    return (
        f"{month} 지출 요약\n{detail}\n"
        f"총지출: {_fmt(total)}원 / 급여 {_fmt(salary)}원 / 잔여 {_fmt(remaining)}원\n"
        f"저축률: {saving_rate:.1f}% (저축 {_fmt(saving)}원)"
    )


async def _tool_calc_trend(user_id: str, args: dict) -> str:
    category = args.get("category")
    months = int(args.get("months", 6))

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if category:
            rows = await (await db.execute(
                "SELECT month, amount FROM expenses WHERE user_id = ? AND category = ? "
                "ORDER BY month DESC LIMIT ?",
                (user_id, category, months),
            )).fetchall()
            series = sorted([(r["month"], r["amount"]) for r in rows])
            label = f"{category} 지출"
        else:
            rows = await (await db.execute(
                "SELECT month, SUM(amount) AS s FROM expenses WHERE user_id = ? "
                "GROUP BY month ORDER BY month DESC LIMIT ?",
                (user_id, months),
            )).fetchall()
            series = sorted([(r["month"], r["s"]) for r in rows])
            label = "전체 지출"

    if not series:
        return f"{label} 데이터가 없습니다."

    avg = sum(v for _, v in series) / len(series)
    last = series[-1][1]
    first = series[0][1]
    delta_pct = ((last - first) / first * 100) if first else 0

    lines = [f"  {m}: {_fmt(v)}원" for m, v in series]
    return (
        f"최근 {len(series)}개월 {label} 추이\n" + "\n".join(lines) + "\n"
        f"평균 {_fmt(avg)}원 / 기간 증감률 {delta_pct:+.1f}%"
    )


async def _tool_check_goal(user_id: str, _args: dict) -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        goal = await (await db.execute(
            "SELECT * FROM goals WHERE user_id = ?", (user_id,)
        )).fetchone()
        if not goal:
            return "설정된 목표가 없습니다."
        assets_row = await (await db.execute(
            "SELECT SUM(amount) AS s FROM assets WHERE user_id = ?", (user_id,)
        )).fetchone()
        total = assets_row["s"] or 0

        avg_saving_row = await (await db.execute(
            "SELECT AVG(amount) AS a FROM expenses "
            "WHERE user_id = ? AND category = '저축'",
            (user_id,),
        )).fetchone()
        avg_saving = avg_saving_row["a"] or 0

    target = goal["target_amount"]
    target_year = goal["target_year"]
    start_amount = goal["start_amount"]
    today = date.today()
    months_left = max(1, (target_year - today.year) * 12 + (12 - today.month))
    remaining = max(0, target - total)
    monthly_needed = int(remaining / months_left)
    denom = max(1, target - start_amount)
    progress = (total - start_amount) / denom * 100

    if avg_saving > 0:
        months_at_current = int(remaining / avg_saving) if remaining else 0
        eta_year = today.year + (today.month + months_at_current - 1) // 12
        eta_month = (today.month + months_at_current - 1) % 12 + 1
        eta_str = f"{eta_year}-{eta_month:02d}"
    else:
        eta_str = "측정 불가"

    return (
        f"목표 {_fmt(target)}원 ({target_year}년)\n"
        f"현재 자산 {_fmt(total)}원 / 달성률 {progress:.1f}%\n"
        f"잔여 {_fmt(remaining)}원 / 남은 기간 {months_left}개월\n"
        f"목표 연도 내 달성 위한 월 필요액: {_fmt(monthly_needed)}원\n"
        f"현재 평균 저축({_fmt(avg_saving)}원/월) 기준 예상 달성: {eta_str}"
    )


async def _tool_upsert_asset(user_id: str, args: dict) -> str:
    name = (args.get("name") or "").strip()
    amount = args.get("amount")
    if not name or amount is None:
        return "(오류) name과 amount는 필수입니다."
    amount = int(amount)
    type_ = args.get("type")
    category = args.get("category")
    return_rate = args.get("return_rate")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        existing = await (await db.execute(
            "SELECT id, name, type, category, amount, return_rate FROM assets "
            "WHERE user_id = ? AND name = ?",
            (user_id, name),
        )).fetchone()

        if existing:
            new_type = type_ or existing["type"]
            new_category = category or existing["category"]
            new_return = return_rate if return_rate is not None else existing["return_rate"]
            await db.execute(
                "UPDATE assets SET type = ?, category = ?, amount = ?, return_rate = ?, "
                "updated_at = datetime('now','localtime') WHERE id = ?",
                (new_type, new_category, amount, new_return, existing["id"]),
            )
            await db.commit()
            prev = existing["amount"]
            diff = amount - prev
            sign = "+" if diff >= 0 else ""
            return (
                f"자산 '{name}' 업데이트 완료. "
                f"{prev:,}원 → {amount:,}원 ({sign}{diff:,}원). "
                f"유형: {new_type} / 분류: {new_category} / 수익률: {new_return:+.1f}%"
            )

        # new asset — require type/category
        if not type_ or not category:
            return (
                f"(오류) 신규 자산 '{name}' 추가를 위해서는 type과 category가 필요합니다. "
                f"현재 인자: type={type_!r}, category={category!r}."
            )
        await db.execute(
            "INSERT INTO assets (user_id, name, type, category, amount, return_rate) "
            "VALUES (?,?,?,?,?,?)",
            (user_id, name, type_, category, amount, return_rate or 0.0),
        )
        await db.commit()
        return (
            f"신규 자산 '{name}' 추가 완료. "
            f"{amount:,}원 / 유형: {type_} / 분류: {category} / 수익률: {(return_rate or 0):+.1f}%"
        )


async def _tool_delete_asset(user_id: str, args: dict) -> str:
    name = (args.get("name") or "").strip()
    if not name:
        return "(오류) name은 필수입니다."

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # try exact match first, then partial (LIKE)
        rows = await (await db.execute(
            "SELECT id, name, amount FROM assets WHERE user_id = ? AND name = ?",
            (user_id, name),
        )).fetchall()
        if not rows:
            rows = await (await db.execute(
                "SELECT id, name, amount FROM assets WHERE user_id = ? AND name LIKE ?",
                (user_id, f"%{name}%"),
            )).fetchall()

        if not rows:
            return f"(오류) 자산 '{name}' 을(를) 찾을 수 없습니다."
        if len(rows) > 1:
            matches = ", ".join(r["name"] for r in rows)
            return (
                f"(오류) '{name}' 에 해당하는 자산이 여러 개입니다: {matches}. "
                f"정확한 이름으로 다시 시도하세요."
            )

        target = rows[0]
        await db.execute("DELETE FROM assets WHERE id = ?", (target["id"],))
        await db.commit()
        return f"자산 '{target['name']}' ({target['amount']:,}원) 삭제 완료."


async def _tool_list_assets(user_id: str, _args: dict) -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT name, type, category, amount, return_rate FROM assets "
            "WHERE user_id = ? ORDER BY amount DESC",
            (user_id,),
        )).fetchall()

    if not rows:
        return "보유 자산이 없습니다."

    total = sum(r["amount"] for r in rows)
    lines = []
    for r in rows:
        share = (r["amount"] / total * 100) if total else 0
        lines.append(
            f"- {r['name']} ({r['type']}/{r['category']}): "
            f"{r['amount']:,}원 · 비중 {share:.1f}% · 수익률 {r['return_rate']:+.1f}%"
        )
    return "현재 보유 자산 (총 {:,}원)\n".format(total) + "\n".join(lines)


async def _tool_update_goal(user_id: str, args: dict) -> str:
    fields = {k: v for k, v in args.items()
              if k in ("target_amount", "target_year", "start_amount", "start_date")
              and v is not None}
    if not fields:
        return "(오류) 바꿀 항목이 없습니다. target_amount/target_year/start_amount/start_date 중 최소 하나 필요."

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await (await db.execute(
            "SELECT * FROM goals WHERE user_id = ?", (user_id,)
        )).fetchone()
        if cur is None:
            # 처음 생성이면 필수값 최소한 보장
            base = {
                "target_amount": fields.get("target_amount", 0),
                "target_year": fields.get("target_year", 0),
                "start_amount": fields.get("start_amount", 0),
                "start_date": fields.get("start_date", "2024-01"),
            }
            await db.execute(
                "INSERT INTO goals (user_id, target_amount, target_year, start_amount, start_date) "
                "VALUES (?,?,?,?,?)",
                (user_id, base["target_amount"], base["target_year"], base["start_amount"], base["start_date"]),
            )
        else:
            sets, vals = [], []
            for k, v in fields.items():
                sets.append(f"{k} = ?")
                vals.append(v)
            vals.append(user_id)
            await db.execute(f"UPDATE goals SET {', '.join(sets)} WHERE user_id = ?", vals)
        await db.commit()

        new = await (await db.execute(
            "SELECT target_amount, target_year, start_amount, start_date FROM goals WHERE user_id = ?",
            (user_id,),
        )).fetchone()

    return (
        f"재무 목표 수정 완료.\n"
        f"  목표 {_fmt(new['target_amount'])}원 ({new['target_year']}년)\n"
        f"  시작 {_fmt(new['start_amount'])}원 ({new['start_date']})"
    )


async def _tool_update_profile(user_id: str, args: dict) -> str:
    fields = {k: v for k, v in args.items()
              if k in ("name", "department", "salary", "join_year")
              and v is not None and v != ""}
    if not fields:
        return "(오류) 바꿀 항목이 없습니다. name/department/salary/join_year 중 최소 하나 필요."

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        prev = await (await db.execute(
            "SELECT name, department, salary, join_year FROM users WHERE id = ?", (user_id,)
        )).fetchone()
        if not prev:
            return f"(오류) 사용자 {user_id} 를 찾을 수 없습니다."
        sets = [f"{k} = ?" for k in fields]
        vals = list(fields.values()) + [user_id]
        await db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", vals)
        await db.commit()
        new = await (await db.execute(
            "SELECT name, department, salary, join_year FROM users WHERE id = ?", (user_id,)
        )).fetchone()

    diffs = []
    for k in fields:
        if prev[k] != new[k]:
            if k == "salary":
                diffs.append(f"월급 {_fmt(prev[k])}원 → {_fmt(new[k])}원")
            else:
                diffs.append(f"{k}: {prev[k]} → {new[k]}")
    return "프로필 업데이트 완료.\n  " + "\n  ".join(diffs) if diffs else "프로필이 기존과 동일합니다."


async def _tool_simulate_savings(user_id: str, args: dict) -> str:
    monthly_saving = args.get("monthly_saving")
    target_year = args.get("target_year")
    if monthly_saving is None and target_year is None:
        return "(오류) monthly_saving 또는 target_year 중 최소 하나는 필요합니다."

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        goal = await (await db.execute(
            "SELECT target_amount, target_year FROM goals WHERE user_id = ?", (user_id,)
        )).fetchone()
        if not goal:
            return "(오류) 먼저 재무 목표가 설정돼야 합니다."
        total_row = await (await db.execute(
            "SELECT SUM(amount) AS s FROM assets WHERE user_id = ?", (user_id,)
        )).fetchone()
        total = total_row["s"] or 0

    target = goal["target_amount"]
    remaining = max(0, target - total)
    today = date.today()

    lines = [f"목표 {_fmt(target)}원, 현재 자산 {_fmt(total)}원, 남은 금액 {_fmt(remaining)}원"]

    if monthly_saving:
        monthly_saving = int(monthly_saving)
        if monthly_saving <= 0:
            lines.append("  (월 저축액이 0 이하 — 달성 불가)")
        elif remaining == 0:
            lines.append("  이미 목표 달성 상태입니다.")
        else:
            months = -(-remaining // monthly_saving)  # ceil
            eta_year = today.year + (today.month + months - 1) // 12
            eta_month = (today.month + months - 1) % 12 + 1
            lines.append(
                f"  월 {_fmt(monthly_saving)}원 저축 시 {months}개월 후 달성 "
                f"(예상 {eta_year}-{eta_month:02d})"
            )

    if target_year:
        target_year = int(target_year)
        months_left = max(1, (target_year - today.year) * 12 + (12 - today.month))
        needed = int(-(-remaining // months_left)) if remaining else 0
        lines.append(
            f"  {target_year}년 내 달성에 필요한 월 저축액: {_fmt(needed)}원 "
            f"(남은 {months_left}개월)"
        )

    if monthly_saving and target_year:
        _needed = int(-(-remaining // max(1, (target_year - today.year) * 12 + (12 - today.month))))
        diff = monthly_saving - _needed
        sign = "+" if diff >= 0 else ""
        lines.append(f"  요약: 목표 달성에 월 {sign}{_fmt(diff)}원 여유/부족")

    return "\n".join(lines)


async def _tool_add_rule(user_id: str, args: dict) -> str:
    content = (args.get("content") or "").strip()
    if not content:
        return "(오류) content 는 필수입니다."
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO rules (content, user_id) VALUES (?, ?)",
            (content, user_id),
        )
        await db.commit()
    return f"새 규칙 추가: \"{content}\""


async def _tool_remove_rule(user_id: str, args: dict) -> str:
    rule_number = args.get("rule_number")
    content = (args.get("content") or "").strip()
    if rule_number is None and not content:
        return "(오류) rule_number 또는 content 중 하나는 필요합니다."

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await (await db.execute(
            "SELECT id, content FROM rules WHERE user_id IS NULL OR user_id = ? ORDER BY id",
            (user_id,),
        )).fetchall()
        if not rows:
            return "삭제할 규칙이 없습니다."

        target = None
        if rule_number is not None:
            idx = int(rule_number) - 1
            if 0 <= idx < len(rows):
                target = rows[idx]
        if target is None and content:
            matches = [r for r in rows if content in r["content"]]
            if len(matches) == 1:
                target = matches[0]
            elif len(matches) > 1:
                listed = ", ".join(f"#{rows.index(m)+1} {m['content'][:20]}" for m in matches)
                return f"(오류) 여러 규칙이 매칭됐습니다: {listed}. rule_number 로 지정해 주세요."

        if target is None:
            return "(오류) 해당 번호/내용의 규칙을 찾을 수 없습니다."

        await db.execute("DELETE FROM rules WHERE id = ?", (target["id"],))
        await db.commit()

    return f"규칙 삭제: \"{target['content']}\""


async def _tool_add_income(user_id: str, args: dict) -> str:
    month = args.get("month")
    label = (args.get("label") or "").strip()
    amount = args.get("amount")
    if not month or not label or amount is None:
        return "(오류) month/label/amount 모두 필요합니다."
    amount = int(amount)
    if amount <= 0:
        return "(오류) amount 는 양수여야 합니다."

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "INSERT INTO incomes (user_id, month, label, amount) VALUES (?,?,?,?)",
            (user_id, month, label, amount),
        )
        await db.commit()
        row = await (await db.execute(
            "SELECT SUM(amount) AS s FROM incomes WHERE user_id = ? AND month = ?",
            (user_id, month),
        )).fetchone()
        month_total = row["s"] or 0

    return (
        f"{month} 부수입 기록: {label} {_fmt(amount)}원 (#{cur.lastrowid}). "
        f"이번달 부수입 합계: {_fmt(month_total)}원"
    )


async def _tool_remove_income(user_id: str, args: dict) -> str:
    income_id = args.get("income_id")
    month = args.get("month")
    label = (args.get("label") or "").strip() or None

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        if income_id is not None:
            row = await (await db.execute(
                "SELECT * FROM incomes WHERE user_id = ? AND id = ?",
                (user_id, int(income_id)),
            )).fetchone()
            if not row:
                return f"(오류) 부수입 #{income_id} 을 찾을 수 없습니다."
            await db.execute("DELETE FROM incomes WHERE id = ?", (row["id"],))
            await db.commit()
            return f"부수입 삭제: #{row['id']} {row['month']} {row['label']} {_fmt(row['amount'])}원"

        if not (month or label):
            return "(오류) income_id 또는 month/label 중 하나 필요합니다."

        where = ["user_id = ?"]
        params: list = [user_id]
        if month:
            where.append("month = ?"); params.append(month)
        if label:
            where.append("label = ?"); params.append(label)
        rows = await (await db.execute(
            f"SELECT * FROM incomes WHERE {' AND '.join(where)}", params,
        )).fetchall()
        if not rows:
            return "(오류) 해당 부수입을 찾을 수 없습니다."
        if len(rows) > 1:
            listing = ", ".join(
                f"#{r['id']} {r['month']} {r['label']} {r['amount']:,}원"
                for r in rows
            )
            return (
                f"(오류) 여러 건이 매칭됐습니다: {listing}. income_id 로 지정해 주세요."
            )
        target = rows[0]
        await db.execute("DELETE FROM incomes WHERE id = ?", (target["id"],))
        await db.commit()
        return (
            f"부수입 삭제: #{target['id']} {target['month']} {target['label']} "
            f"{_fmt(target['amount'])}원"
        )


async def _tool_list_incomes(user_id: str, args: dict) -> str:
    month = args.get("month")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if month:
            rows = await (await db.execute(
                "SELECT * FROM incomes WHERE user_id = ? AND month = ? ORDER BY id DESC",
                (user_id, month),
            )).fetchall()
        else:
            rows = await (await db.execute(
                "SELECT * FROM incomes WHERE user_id = ? ORDER BY month DESC, id DESC",
                (user_id,),
            )).fetchall()

    if not rows:
        return "기록된 부수입이 없습니다." + (f" ({month})" if month else "")
    lines = [
        f"- #{r['id']} {r['month']} {r['label']} {_fmt(r['amount'])}원"
        for r in rows
    ]
    total = sum(r["amount"] for r in rows)
    header = f"부수입 {len(rows)}건 (합계 {_fmt(total)}원)"
    if month:
        header = f"{month} " + header
    return header + "\n" + "\n".join(lines)


_DISPATCH = {
    "record_expense": _tool_record_expense,
    "get_monthly_summary": _tool_get_monthly_summary,
    "calc_trend": _tool_calc_trend,
    "check_goal": _tool_check_goal,
    "upsert_asset": _tool_upsert_asset,
    "delete_asset": _tool_delete_asset,
    "list_assets": _tool_list_assets,
    "update_goal": _tool_update_goal,
    "update_profile": _tool_update_profile,
    "simulate_savings": _tool_simulate_savings,
    "add_rule": _tool_add_rule,
    "remove_rule": _tool_remove_rule,
    "add_income": _tool_add_income,
    "remove_income": _tool_remove_income,
    "list_incomes": _tool_list_incomes,
}


async def execute_tool(name: str, user_id: str, args: dict) -> str:
    fn = _DISPATCH.get(name)
    if not fn:
        return f"(unknown tool: {name})"
    return await fn(user_id, args)
