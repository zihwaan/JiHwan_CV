"""
Seed script — resets the DB and inserts the demo user, assets, expenses,
goal, and rules.

Run with:
    python seed.py
"""
import asyncio
import aiosqlite

from database import DB_PATH, init_db


USER_ID = "user-jihwan-001"

USER = {
    "id": USER_ID,
    "name": "변지환",
    "department": "반도체연구소",
    "salary": 6100000,
    "join_year": 2021,
}

ASSETS = [
    {"name": "삼성전자 우리사주",      "type": "국내주식",  "category": "비유동", "amount": 15000000, "return_rate": 12.3},
    {"name": "KODEX 200 ETF",         "type": "ETF",      "category": "유동",   "amount": 8000000,  "return_rate": 7.2},
    {"name": "KB 정기예금",            "type": "예금",      "category": "유동",   "amount": 12000000, "return_rate": 3.5},
    {"name": "주택청약저축",            "type": "저축",      "category": "비유동", "amount": 5000000,  "return_rate": 2.8},
    {"name": "미국주식 (NVDA·AAPL)",   "type": "해외주식",  "category": "유동",   "amount": 9500000,  "return_rate": 18.5},
    {"name": "비트코인",               "type": "가상화폐",  "category": "유동",   "amount": 3000000,  "return_rate": -5.2},
]

EXPENSES = [
    # 2025-11
    {"month": "2025-11", "category": "식비", "amount": 400000},
    {"month": "2025-11", "category": "교통", "amount": 150000},
    {"month": "2025-11", "category": "주거", "amount": 600000},
    {"month": "2025-11", "category": "쇼핑", "amount": 300000},
    {"month": "2025-11", "category": "여가", "amount": 200000},
    {"month": "2025-11", "category": "저축", "amount": 2000000},
    {"month": "2025-11", "category": "기타", "amount": 250000},
    # 2025-12
    {"month": "2025-12", "category": "식비", "amount": 450000},
    {"month": "2025-12", "category": "교통", "amount": 140000},
    {"month": "2025-12", "category": "주거", "amount": 600000},
    {"month": "2025-12", "category": "쇼핑", "amount": 500000},
    {"month": "2025-12", "category": "여가", "amount": 350000},
    {"month": "2025-12", "category": "저축", "amount": 2000000},
    {"month": "2025-12", "category": "기타", "amount": 300000},
    # 2026-01
    {"month": "2026-01", "category": "식비", "amount": 380000},
    {"month": "2026-01", "category": "교통", "amount": 130000},
    {"month": "2026-01", "category": "주거", "amount": 600000},
    {"month": "2026-01", "category": "쇼핑", "amount": 280000},
    {"month": "2026-01", "category": "여가", "amount": 180000},
    {"month": "2026-01", "category": "저축", "amount": 2500000},
    {"month": "2026-01", "category": "기타", "amount": 220000},
    # 2026-02
    {"month": "2026-02", "category": "식비", "amount": 410000},
    {"month": "2026-02", "category": "교통", "amount": 145000},
    {"month": "2026-02", "category": "주거", "amount": 600000},
    {"month": "2026-02", "category": "쇼핑", "amount": 320000},
    {"month": "2026-02", "category": "여가", "amount": 220000},
    {"month": "2026-02", "category": "저축", "amount": 2500000},
    {"month": "2026-02", "category": "기타", "amount": 260000},
    # 2026-03
    {"month": "2026-03", "category": "식비", "amount": 420000},
    {"month": "2026-03", "category": "교통", "amount": 160000},
    {"month": "2026-03", "category": "주거", "amount": 600000},
    {"month": "2026-03", "category": "쇼핑", "amount": 290000},
    {"month": "2026-03", "category": "여가", "amount": 190000},
    {"month": "2026-03", "category": "저축", "amount": 2500000},
    {"month": "2026-03", "category": "기타", "amount": 240000},
    # 2026-04
    {"month": "2026-04", "category": "식비", "amount": 395000},
    {"month": "2026-04", "category": "교통", "amount": 135000},
    {"month": "2026-04", "category": "주거", "amount": 600000},
    {"month": "2026-04", "category": "쇼핑", "amount": 310000},
    {"month": "2026-04", "category": "여가", "amount": 210000},
    {"month": "2026-04", "category": "저축", "amount": 2500000},
    {"month": "2026-04", "category": "기타", "amount": 230000},
]

GOAL = {
    "target_amount": 100000000,
    "target_year": 2028,
    "start_amount": 20000000,
    "start_date": "2024-01",
}

RULES = [
    "월 실수령액의 40% 이상을 저축/투자에 배분한다",
    "비유동 자산 비율은 전체 자산의 30~50%로 유지한다",
    "단일 종목 비중은 포트폴리오의 30%를 초과하지 않는다",
    "긴급자금은 월 생활비 3개월치 이상 유동 자산으로 유지한다",
    "해외 자산 비중은 20~40% 수준으로 분산 유지한다",
]


async def seed():
    await init_db()

    async with aiosqlite.connect(DB_PATH) as db:
        # wipe everything first so this script is idempotent
        await db.execute("DELETE FROM assets")
        await db.execute("DELETE FROM expenses")
        await db.execute("DELETE FROM goals")
        await db.execute("DELETE FROM rules")
        await db.execute("DELETE FROM users")

        await db.execute(
            "INSERT INTO users (id, name, department, salary, join_year) VALUES (?,?,?,?,?)",
            (USER["id"], USER["name"], USER["department"], USER["salary"], USER["join_year"]),
        )

        for a in ASSETS:
            await db.execute(
                "INSERT INTO assets (user_id, name, type, category, amount, return_rate) "
                "VALUES (?,?,?,?,?,?)",
                (USER_ID, a["name"], a["type"], a["category"], a["amount"], a["return_rate"]),
            )

        for e in EXPENSES:
            await db.execute(
                "INSERT INTO expenses (user_id, month, category, amount) VALUES (?,?,?,?)",
                (USER_ID, e["month"], e["category"], e["amount"]),
            )

        await db.execute(
            "INSERT INTO goals (user_id, target_amount, target_year, start_amount, start_date) "
            "VALUES (?,?,?,?,?)",
            (USER_ID, GOAL["target_amount"], GOAL["target_year"],
             GOAL["start_amount"], GOAL["start_date"]),
        )

        for r in RULES:
            await db.execute(
                "INSERT INTO rules (content, user_id) VALUES (?, NULL)",
                (r,),
            )

        await db.commit()

    print(f"seeded: user={USER_ID}, assets={len(ASSETS)}, "
          f"expenses={len(EXPENSES)}, rules={len(RULES)}")


if __name__ == "__main__":
    asyncio.run(seed())
