"""
Shared read-side service — builds the full user context dictionary that's
returned by /api/dashboard and also fed to the AI agent as RAG context.

Keeping this here (instead of duplicating in two routers) means the agent
sees exactly the same numbers the dashboard shows.

Net-worth reconstruction (the "asset trajectory" the UI graphs):

    nw(month₀)   = goal.start_amount      # anchor
    nw(month_k)  = nw(month_{k-1}) + salary + extra_income(k) - expenses(k)

Where `expenses(k)` is the sum of ALL categories for that month (including
저축, which in our model is labelled as an expense row for book-keeping but
is really a transfer to savings — either way, salary-expenses is the net
cash accretion for the month, i.e. Δnet-worth).

We intentionally anchor at `goal.start_amount` (not the current `total_assets`)
because that's the user's own reference point, and it lets the chart show
ACTUAL progress toward the goal rather than a retroactively rebased line.
"""
from __future__ import annotations

from datetime import date
import aiosqlite

from database import DB_PATH


# ---------------------------------------------------------------------------
# Per-month rule evaluation
# ---------------------------------------------------------------------------
# Rules 1/4 genuinely vary month-to-month (they depend on that month's
# income/spend). Rules 2/3/5 describe portfolio composition and we don't
# keep historical asset snapshots, so we fall back to the CURRENT portfolio
# and mark those evals as "snapshot" — the UI should surface that caveat.

RULE_META = [
    {"id": 1, "title": "저축률 ≥ 40%",      "scope": "monthly"},
    {"id": 2, "title": "비유동 30~50%",    "scope": "snapshot"},
    {"id": 3, "title": "단일 종목 ≤ 30%",  "scope": "snapshot"},
    {"id": 4, "title": "긴급자금 3개월치",  "scope": "monthly"},
    {"id": 5, "title": "해외 비중 20~40%", "scope": "snapshot"},
]


def _eval_rules_for_month(month: str, *, month_expenses: dict, month_extra_income: int,
                          salary: int, assets: list, total_assets: int,
                          liquid_amount: int, illiquid_amount: int) -> list[dict]:
    """Deterministic per-month rule evaluation. No LLM involved.

    Returns a list of 5 dicts, one per rule, with `compliant: bool`,
    numeric `value`, human-readable `note`, and `scope` ("monthly" or
    "snapshot" to flag whether the value is month-specific or just the
    current portfolio composition).
    """
    out: list[dict] = []

    # Rule 1 — saving rate
    saving = month_expenses.get("저축", 0)
    income = salary + month_extra_income
    rate = (saving / income * 100) if income else 0
    out.append({
        **RULE_META[0],
        "compliant": rate >= 40,
        "value": round(rate, 1),
        "note": f"저축 {saving:,}원 / 수입 {income:,}원 = {rate:.1f}%",
    })

    # Rule 2 — illiquid 30~50%
    illiq_ratio = (illiquid_amount / total_assets * 100) if total_assets else 0
    out.append({
        **RULE_META[1],
        "compliant": 30 <= illiq_ratio <= 50,
        "value": round(illiq_ratio, 1),
        "note": f"비유동 비중 {illiq_ratio:.1f}% (현재 포트폴리오 기준)",
    })

    # Rule 3 — single name ≤ 30%
    max_share = 0.0
    top_name = None
    if total_assets:
        for a in assets:
            s = a["amount"] / total_assets * 100
            if s > max_share:
                max_share = s
                top_name = a["name"]
    out.append({
        **RULE_META[2],
        "compliant": max_share <= 30,
        "value": round(max_share, 1),
        "note": (f"최대 비중 {top_name} {max_share:.1f}%"
                 if top_name else "자산 없음"),
    })

    # Rule 4 — emergency fund ≥ 3 months of non-saving spend
    non_saving = sum(v for k, v in month_expenses.items() if k != "저축")
    needed = non_saving * 3
    out.append({
        **RULE_META[3],
        "compliant": liquid_amount >= needed if needed else True,
        "value": needed,
        "note": (f"월 비저축 지출 {non_saving:,}원 × 3 = {needed:,}원 필요, "
                 f"현재 유동 {liquid_amount:,}원"),
    })

    # Rule 5 — overseas 20~40%
    overseas = sum(a["amount"] for a in assets if a.get("type") == "해외주식")
    overseas_ratio = (overseas / total_assets * 100) if total_assets else 0
    out.append({
        **RULE_META[4],
        "compliant": 20 <= overseas_ratio <= 40,
        "value": round(overseas_ratio, 1),
        "note": f"해외 비중 {overseas_ratio:.1f}% (현재 포트폴리오 기준)",
    })

    return out




async def build_user_context(user_id: str) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        user_row = await (await db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        )).fetchone()
        if not user_row:
            raise ValueError(f"user {user_id} not found")
        user = dict(user_row)

        asset_rows = await (await db.execute(
            "SELECT id, name, type, category, amount, return_rate, updated_at "
            "FROM assets WHERE user_id = ? ORDER BY amount DESC",
            (user_id,),
        )).fetchall()
        assets = [dict(r) for r in asset_rows]

        expense_rows = await (await db.execute(
            "SELECT month, category, amount FROM expenses "
            "WHERE user_id = ? ORDER BY month, category",
            (user_id,),
        )).fetchall()

        income_rows = await (await db.execute(
            "SELECT id, month, label, amount FROM incomes "
            "WHERE user_id = ? ORDER BY month, id",
            (user_id,),
        )).fetchall()

        goal_row = await (await db.execute(
            "SELECT target_amount, target_year, start_amount, start_date "
            "FROM goals WHERE user_id = ?",
            (user_id,),
        )).fetchone()

        rule_rows = await (await db.execute(
            "SELECT content FROM rules WHERE user_id IS NULL OR user_id = ? ORDER BY id",
            (user_id,),
        )).fetchall()


    salary = user.get("salary") or 0

    total_assets = sum(a["amount"] for a in assets)
    liquid_amount = sum(a["amount"] for a in assets if a["category"] == "유동")
    illiquid_amount = total_assets - liquid_amount
    liquid_ratio = (liquid_amount / total_assets * 100) if total_assets else 0

    # expenses_by_month: {month: {category: amount}}
    expenses_by_month: dict[str, dict[str, int]] = {}
    for r in expense_rows:
        expenses_by_month.setdefault(r["month"], {})[r["category"]] = r["amount"]

    # incomes_by_month: {month: [{id, label, amount}]} + per-month totals
    incomes_by_month: dict[str, list[dict]] = {}
    extra_income_by_month: dict[str, int] = {}
    incomes_flat: list[dict] = []
    for r in income_rows:
        d = {"id": r["id"], "label": r["label"], "amount": r["amount"], "month": r["month"]}
        incomes_by_month.setdefault(r["month"], []).append(d)
        extra_income_by_month[r["month"]] = extra_income_by_month.get(r["month"], 0) + r["amount"]
        incomes_flat.append(d)

    # Real net-worth reconstruction.
    months = sorted(set(list(expenses_by_month.keys()) + list(extra_income_by_month.keys())))

    # Anchor the trajectory. If goal.start_amount is missing or zero, fall
    # back to working BACKWARDS from the current total_assets: subtract the
    # net inflow of every known month so the last point lines up with
    # total_assets and the first point is a sensible starting balance.
    raw_start = (goal_row["start_amount"] if goal_row else 0) or 0
    if raw_start > 0:
        start_amount = raw_start
        anchor_is_back_computed = False
    else:
        # compute aggregate inflow to back-out from total_assets
        total_delta = 0
        for m in months:
            inflow = salary + extra_income_by_month.get(m, 0)
            out = sum(expenses_by_month.get(m, {}).values())
            saving = expenses_by_month.get(m, {}).get("저축", 0)
            total_delta += inflow - (out - saving)
        start_amount = max(0, total_assets - total_delta)
        anchor_is_back_computed = True

    net_worth_series: list[dict] = []
    cum = start_amount
    for m in months:
        inflow = salary + extra_income_by_month.get(m, 0)
        out = sum(expenses_by_month.get(m, {}).values())
        # "저축" is a transfer, not a consumption — put it BACK so net-worth
        # change reflects assets gained, not cash disbursed to an account.
        saving = expenses_by_month.get(m, {}).get("저축", 0)
        delta = inflow - (out - saving)
        cum += delta
        net_worth_series.append({
            "month": m,
            "salary": salary,
            "extra_income": extra_income_by_month.get(m, 0),
            "expenses_total": out,
            "saving": saving,
            "net_change": delta,
            "net_worth": cum,
        })

    # MoM change now computed from the reconstructed series (not hardcoded 5%).
    if len(net_worth_series) >= 2:
        last = net_worth_series[-1]["net_worth"]
        prev = net_worth_series[-2]["net_worth"]
        mom_return = ((last - prev) / prev * 100) if prev else 0
        prev_month_total = prev
    elif net_worth_series:
        mom_return = 0
        prev_month_total = net_worth_series[-1]["net_worth"]
    else:
        mom_return = 0
        prev_month_total = total_assets

    cumulative_return = ((total_assets - start_amount) / start_amount * 100) if start_amount else 0

    today = date.today()
    goal_dict = None
    if goal_row:
        target_amount = goal_row["target_amount"]
        target_year = goal_row["target_year"]
        months_left = max(1, (target_year - today.year) * 12 + (12 - today.month))
        remaining = max(0, target_amount - total_assets)
        monthly_needed = int(remaining / months_left) if months_left else 0
        denom = max(1, target_amount - start_amount)
        progress_pct = (total_assets - start_amount) / denom * 100
        goal_dict = {
            "target_amount": target_amount,
            "target_year": target_year,
            "start_amount": start_amount,
            "start_date": goal_row["start_date"],
            "progress_pct": round(progress_pct, 2),
            "monthly_needed": monthly_needed,
            "months_left": months_left,
        }

    rules_list = [r["content"] for r in rule_rows]

    rule_evals_by_month: dict[str, dict] = {}
    for m in months:
        details = _eval_rules_for_month(
            m,
            month_expenses=expenses_by_month.get(m, {}),
            month_extra_income=extra_income_by_month.get(m, 0),
            salary=salary,
            assets=assets,
            total_assets=total_assets,
            liquid_amount=liquid_amount,
            illiquid_amount=illiquid_amount,
        )
        passed = sum(1 for d in details if d["compliant"])
        rule_evals_by_month[m] = {
            "details": details,
            "passed": passed,
            "violated": len(details) - passed,
        }

    # "Configured" = user has finished the onboarding wizard. We treat the
    # absence of any of {name, salary, at least one asset or a goal} as
    # evidence the account is still at its factory state and the frontend
    # should prompt the user through the wizard before showing the rest.
    configured = bool(
        (user.get("name") or "").strip()
        and (salary or 0) > 0
        and (len(assets) > 0 or goal_row is not None)
    )

    return {
        "configured": configured,
        "profile": {
            "name": user["name"],
            "department": user["department"],
            "salary": salary,
            "join_year": user["join_year"],
        },
        "assets": assets,
        "total_assets": total_assets,
        "prev_month_total": prev_month_total,
        "mom_return": round(mom_return, 2),
        "cumulative_return": round(cumulative_return, 2),
        "liquid_amount": liquid_amount,
        "illiquid_amount": illiquid_amount,
        "liquid_ratio": round(liquid_ratio, 2),
        "expenses_by_month": expenses_by_month,
        "incomes": incomes_flat,
        "incomes_by_month": incomes_by_month,
        "extra_income_by_month": extra_income_by_month,
        "net_worth_series": net_worth_series,
        "goal": goal_dict,
        "rules": rules_list,
        "rule_evals_by_month": rule_evals_by_month,
    }
