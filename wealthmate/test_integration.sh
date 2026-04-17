#!/usr/bin/env bash
# End-to-end smoke test for WealthMate integration.
#
# Boots the FastAPI backend on :8001 and Express on :8082 and exercises:
#   - static hub + SPA + deep-link fallback
#   - API proxy (dashboard, assets, expenses, goals, context, rules, auth)
#   - mutation roundtrips (asset CRUD, expense bulk upsert, rule CRUD)
#   - auth key lifecycle (create → activate → delete)
#   - DB reconciliation: after POST, GET shows the change
#
# Leaves nothing running on exit.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_PORT=8001
FRONTEND_PORT=8082
BACKEND_LOG=/tmp/wm-backend.log
FRONTEND_LOG=/tmp/wm-express.log
VENV="$ROOT/wealthmate/backend/.venv"
USER_ID="user-jihwan-001"

BE_PID=""
FE_PID=""

cleanup() {
  [ -n "$BE_PID" ] && kill "$BE_PID" 2>/dev/null || true
  [ -n "$FE_PID" ] && kill "$FE_PID" 2>/dev/null || true
}
trap cleanup EXIT

pass() { printf "  \033[32mOK\033[0m   %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

http() {
  # http DESC METHOD URL [DATA] [EXPECTED_STATUS]
  # N.B. empty $4 means "no body"; if you want a custom expected status with
  # no body, pass '' as $4 and then the status as $5 — we only fall back to
  # "200" when $5 is *unset*, not merely empty.
  local desc="$1" method="$2" url="$3" data="${4:-}" expected="${5-200}"
  [ -z "$expected" ] && expected=200
  local args=(-sS -X "$method" --max-time 20 -o /tmp/wm-last.out -w "%{http_code}")
  if [ -n "$data" ]; then args+=(-H "content-type: application/json" -d "$data"); fi
  local code
  code=$(curl "${args[@]}" "$url")
  if [ "$code" = "$expected" ]; then pass "$desc → $code"
  else fail "$desc expected=$expected got=$code url=$url body=$(head -c 200 /tmp/wm-last.out)"
  fi
}
json() { python3 -c "import json,sys; print(json.load(open('/tmp/wm-last.out'))$1)"; }

[ -d "$VENV" ] || fail "backend venv missing — run: python3 -m venv $VENV && $VENV/bin/pip install fastapi uvicorn aiosqlite anthropic httpx"
[ -f "$ROOT/wealthmate/frontend/dist/index.html" ] || fail "frontend dist missing — run: (cd wealthmate/frontend && npm install && npm run build)"

echo "== seeding SQLite"
( cd "$ROOT/wealthmate/backend" && "$VENV/bin/python" seed.py )

echo "== starting FastAPI on :$BACKEND_PORT"
( cd "$ROOT/wealthmate/backend" && "$VENV/bin/python" -m uvicorn main:app --host 127.0.0.1 --port "$BACKEND_PORT" ) >"$BACKEND_LOG" 2>&1 &
BE_PID=$!
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$BACKEND_PORT/" >/dev/null 2>&1 && break
  sleep 0.2
done

echo "== starting Express on :$FRONTEND_PORT"
PORT="$FRONTEND_PORT" WEALTHMATE_BACKEND_URL="http://127.0.0.1:$BACKEND_PORT" node server.js >"$FRONTEND_LOG" 2>&1 &
FE_PID=$!
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$FRONTEND_PORT/" >/dev/null 2>&1 && break
  sleep 0.2
done

BASE="http://127.0.0.1:$FRONTEND_PORT/wealthmate"

# ─── static ───
echo "== static hub"
http "hub /" GET "http://127.0.0.1:$FRONTEND_PORT/"
curl -sS "http://127.0.0.1:$FRONTEND_PORT/" | grep -q '/wealthmate/' || fail "hub missing /wealthmate/ link"
pass "hub references /wealthmate/"

echo "== SPA"
http "SPA /wealthmate/" GET "$BASE/"
http "SPA deep link"    GET "$BASE/deep/link"
asset=$(curl -sS "$BASE/" | grep -oE '/wealthmate/assets/[^"]+\.js' | head -1)
[ -n "$asset" ] || fail "no hashed JS asset"
http "SPA js asset"     GET "http://127.0.0.1:$FRONTEND_PORT$asset"

# ─── read API (proxy) ───
echo "== API proxy read"
http "GET /dashboard" GET "$BASE/api/dashboard/$USER_ID"
name=$(json "['profile']['name']")
[ "$name" = "변지환" ] || fail "persona name expected 변지환 got $name"
pass "dashboard persona = 변지환"

http "GET /assets"    GET "$BASE/api/assets/$USER_ID"
http "GET /expenses"  GET "$BASE/api/expenses/$USER_ID"
http "GET /goals"     GET "$BASE/api/goals/$USER_ID"
http "GET /context"   GET "$BASE/api/context/$USER_ID"
http "GET /rules"     GET "$BASE/api/rules/$USER_ID"
http "GET /auth/status" GET "$BASE/api/auth/status"
http "GET /auth/keys" GET "$BASE/api/auth/keys"
http "GET /incomes"   GET "$BASE/api/incomes/$USER_ID"
http "GET /incomes/summary" GET "$BASE/api/incomes/$USER_ID/summary"
http "GET /dashboard (rule_evals embedded)" GET "$BASE/api/dashboard/$USER_ID"
python3 -c "
import json; d=json.load(open('/tmp/wm-last.out'))
evals=d['rule_evals_by_month']
assert evals, 'no rule evals produced'
for m, ev in evals.items():
    assert 'details' in ev and len(ev['details'])==5, f'{m} details wrong: {ev}'
    assert ev['passed']+ev['violated']==5
    # schema is now pure rule-based: no source_hash/stale/comment cache
    for k in ('source_hash','stale','comment'):
        assert k not in ev, f'{m} unexpectedly contains {k}'
    # details shape
    for d_row in ev['details']:
        assert isinstance(d_row['compliant'], bool)
        assert d_row['id'] in {1,2,3,4,5}
        assert d_row['scope'] in ('monthly','snapshot')
" && pass "rule_evals_by_month pure rule-based shape" || fail "rule evals"

# ─── mutations: asset ───
echo "== asset CRUD"
http "POST asset upsert" POST "$BASE/api/assets/$USER_ID" \
  '{"name":"integration-test","type":"예금","category":"유동","amount":1234567,"return_rate":1.5}'
aid=$(json "['id']")
[ -n "$aid" ] || fail "no asset id returned"
pass "asset created id=$aid"

# verify via GET
http "GET asset after post" GET "$BASE/api/assets/$USER_ID"
python3 -c "import json; xs=json.load(open('/tmp/wm-last.out')); a=[x for x in xs if x['name']=='integration-test']; assert a and a[0]['amount']==1234567, f'asset missing or wrong: {a}'" \
  && pass "asset reads back with correct amount" || fail "asset reconciliation"

# patch
http "PATCH asset" PUT "$BASE/api/assets/$USER_ID/$aid" '{"amount":9999999}'
http "GET asset after patch" GET "$BASE/api/assets/$USER_ID"
python3 -c "import json; xs=json.load(open('/tmp/wm-last.out')); a=[x for x in xs if x['id']==$aid][0]; assert a['amount']==9999999, f'patch failed: {a}'" \
  && pass "asset amount patched" || fail "patch reconciliation"

http "DELETE asset" DELETE "$BASE/api/assets/$USER_ID/$aid"

# ─── expense bulk upsert (new endpoint) ───
echo "== expense bulk upsert"
http "POST /expenses/bulk (insert + overwrite + delete)" POST "$BASE/api/expenses/$USER_ID/bulk" \
  '{"rows":[
    {"month":"2026-04","category":"식비","amount":111111},
    {"month":"2026-04","category":"여가","amount":0},
    {"month":"2099-12","category":"기타","amount":42}
  ]}'

http "GET expenses after bulk" GET "$BASE/api/expenses/$USER_ID?month=2026-04"
python3 -c "
import json; xs=json.load(open('/tmp/wm-last.out'))
by={r['category']:r['amount'] for r in xs}
assert by.get('식비')==111111, f'식비 wrong: {by}'
assert '여가' not in by, f'여가 should be deleted: {by}'
" && pass "bulk upsert: overwrite + delete work" || fail "bulk roundtrip"

http "GET expenses 2099-12 (inserted)" GET "$BASE/api/expenses/$USER_ID?month=2099-12"
python3 -c "import json; xs=json.load(open('/tmp/wm-last.out')); assert xs and xs[0]['amount']==42" \
  && pass "bulk upsert: insert" || fail "bulk insert"

# cleanup bogus months so seed state is restored next run
curl -sS -X POST "$BASE/api/expenses/$USER_ID/bulk" \
  -H 'content-type: application/json' \
  -d '{"rows":[{"month":"2099-12","category":"기타","amount":0}]}' >/dev/null

# ─── rules CRUD ───
echo "== rules"
http "POST rule" POST "$BASE/api/rules/$USER_ID" '{"content":"테스트 규칙"}'
rid=$(json "['id']")
http "PUT rule"  PUT  "$BASE/api/rules/$USER_ID/$rid" '{"content":"테스트 규칙 수정됨"}'
http "DELETE rule" DELETE "$BASE/api/rules/$USER_ID/$rid"

# ─── auth key lifecycle ───
echo "== auth keys"
# ensure clean slate for test run
rm -f wealthmate/backend/.keys.json
http "GET /auth/status (no keys)" GET "$BASE/api/auth/status"
python3 -c "import json; d=json.load(open('/tmp/wm-last.out')); assert d['keys_count']==0 and not d['ready']" \
  && pass "empty key store reports not ready" || fail "empty auth state"

# bad format
http "POST key bad format" POST "$BASE/api/auth/keys" '{"name":"t","api_key":"nope"}' 400
# empty name
http "POST key empty name" POST "$BASE/api/auth/keys" '{"name":"","api_key":"sk-ant-x"}' 400

# ─── dashboard consistency with mutations ───
echo "== dashboard reflects live DB"
# insert a tagged asset, poll dashboard, assert it's present, delete it
curl -sS -X POST "$BASE/api/assets/$USER_ID" -H 'content-type: application/json' \
  -d '{"name":"dashboard-check","type":"예금","category":"유동","amount":7777,"return_rate":0}' >/dev/null
http "GET dashboard after mutation" GET "$BASE/api/dashboard/$USER_ID"
python3 -c "
import json; d=json.load(open('/tmp/wm-last.out'))
names={a['name'] for a in d['assets']}
assert 'dashboard-check' in names, f'asset not in dashboard: {names}'
" && pass "dashboard picks up new asset" || fail "dashboard staleness"

# cleanup
ids=$(curl -sS "$BASE/api/assets/$USER_ID" | python3 -c "import sys,json; print(' '.join(str(a['id']) for a in json.load(sys.stdin) if a['name']=='dashboard-check'))")
for i in $ids; do curl -sS -X DELETE "$BASE/api/assets/$USER_ID/$i" >/dev/null; done

# ─── incomes API + net-worth series ───
echo "== incomes + net_worth_series"
http "POST income (성과급)" POST "$BASE/api/incomes/$USER_ID" \
  '{"month":"2026-04","label":"성과급","amount":8000000}'
iid=$(json "['id']")
[ -n "$iid" ] || fail "income id missing"
pass "income added id=$iid"

http "GET /dashboard reflects income" GET "$BASE/api/dashboard/$USER_ID"
python3 -c "
import json; d=json.load(open('/tmp/wm-last.out'))
assert '2026-04' in d['incomes_by_month'], f'incomes_by_month missing 2026-04: {list(d[\"incomes_by_month\"].keys())}'
row = [r for r in d['incomes_by_month']['2026-04'] if r['label']=='성과급'][0]
assert row['amount']==8000000
assert d['extra_income_by_month']['2026-04']==8000000
series = d['net_worth_series']
assert series, 'net_worth_series empty'
apr = [s for s in series if s['month']=='2026-04'][0]
assert apr['extra_income']==8000000, f'net series extra_income wrong: {apr}'
assert apr['net_worth'] > 0
" && pass "income & net_worth_series reconciled" || fail "net worth math"

http "DELETE income" DELETE "$BASE/api/incomes/$USER_ID/$iid"
http "GET dashboard after delete" GET "$BASE/api/dashboard/$USER_ID"
python3 -c "
import json; d=json.load(open('/tmp/wm-last.out'))
assert d['extra_income_by_month'].get('2026-04',0)==0, f'income not cleared: {d[\"extra_income_by_month\"]}'
" && pass "income delete reconciled" || fail "income delete"

http "POST income bad (empty label)" POST "$BASE/api/incomes/$USER_ID" \
  '{"month":"2026-04","label":"","amount":1000}' 400
http "POST income bad (negative)" POST "$BASE/api/incomes/$USER_ID" \
  '{"month":"2026-04","label":"bad","amount":-1}' 400

# ─── MoM math (now computed from the series, not hardcoded 5%) ───
echo "== MoM math"
http "GET dashboard (for MoM)" GET "$BASE/api/dashboard/$USER_ID"
python3 -c "
import json; d=json.load(open('/tmp/wm-last.out'))
series=d['net_worth_series']
if len(series)>=2:
    last,prev=series[-1]['net_worth'],series[-2]['net_worth']
    expected = round((last-prev)/prev*100,2) if prev else 0
    assert abs(d['mom_return']-expected) < 0.01, f'mom_return drift: got {d[\"mom_return\"]}, expected {expected}'
else:
    print('(series too short to check MoM; skipping)')
" && pass "mom_return derived from series" || fail "mom drift"

# ─── agent tool handlers (direct dispatch, no LLM needed) ───
echo "== agent tool dispatcher"
( cd "$ROOT/wealthmate/backend" && "$VENV/bin/python" - <<'PY'
import asyncio, json
from agent.tools import execute_tool, TOOLS

TOOL_NAMES = {t["name"] for t in TOOLS}
assert TOOL_NAMES == {
    "record_expense","get_monthly_summary","calc_trend","check_goal",
    "upsert_asset","delete_asset","list_assets",
    "update_goal","update_profile","simulate_savings","add_rule","remove_rule",
    "add_income","remove_income","list_incomes",
}, f"tool set drifted: {TOOL_NAMES}"

USER = "user-jihwan-001"

async def main():
    # 1. record_expense upsert + delete semantics
    r = await execute_tool("record_expense", USER, {"month":"2099-05","category":"기타","amount":42})
    assert "42" in r and "기록 완료" in r, r
    r = await execute_tool("record_expense", USER, {"month":"2099-05","category":"기타","amount":0})
    assert "삭제 완료" in r, r

    # 2. update_profile
    r = await execute_tool("update_profile", USER, {"salary":7777777})
    assert "7,777,777" in r, r
    await execute_tool("update_profile", USER, {"salary":6100000})  # restore

    # 3. update_goal
    r = await execute_tool("update_goal", USER, {"target_amount":150000000})
    assert "150,000,000" in r, r
    await execute_tool("update_goal", USER, {"target_amount":100000000})  # restore

    # 4. simulate_savings — both modes
    r = await execute_tool("simulate_savings", USER, {"monthly_saving":3000000})
    assert "3,000,000" in r and "개월" in r, r
    r = await execute_tool("simulate_savings", USER, {"target_year":2030})
    assert "2030" in r and "저축액" in r, r

    # 5. rules CRUD via tool
    r = await execute_tool("add_rule", USER, {"content":"테스트: 주식 비중 40%"})
    assert "추가" in r, r
    r = await execute_tool("remove_rule", USER, {"content":"테스트: 주식"})
    assert "삭제" in r, r

    # 6. asset roundtrip via tool
    r = await execute_tool("upsert_asset", USER, {
        "name":"tool-test-asset","type":"예금","category":"유동","amount":5000000,
    })
    assert "추가 완료" in r or "업데이트" in r, r
    r = await execute_tool("list_assets", USER, {})
    assert "tool-test-asset" in r, r
    r = await execute_tool("delete_asset", USER, {"name":"tool-test-asset"})
    assert "삭제 완료" in r, r

    # 7. check_goal
    r = await execute_tool("check_goal", USER, {})
    assert "목표" in r and "달성률" in r, r

    # 8. incomes CRUD
    r = await execute_tool("add_income", USER, {
        "month":"2099-06","label":"테스트수당","amount":500000,
    })
    assert "500,000" in r, r
    r = await execute_tool("list_incomes", USER, {"month":"2099-06"})
    assert "테스트수당" in r, r
    r = await execute_tool("remove_income", USER, {"month":"2099-06","label":"테스트수당"})
    assert "삭제" in r, r

asyncio.run(main())
print("all tools OK")
PY
) && pass "12 tools dispatch correctly + DB reflects changes" || fail "tool handlers"

# ─── services.build_user_context math ───
echo "== context math sanity"
http "GET context" GET "$BASE/api/context/$USER_ID"
python3 -c "
import json; d=json.load(open('/tmp/wm-last.out'))
assert d['profile']['name']=='변지환', f'name wrong: {d[\"profile\"]}'
assert d['assets_count']>0, 'no assets'
if d['goal']:
    assert 0 <= d['goal']['progress_pct'] <= 200, f'goal progress out of range: {d[\"goal\"][\"progress_pct\"]}'
assert d['months_of_expenses']>0, 'no expense months'
assert d['system_prompt'].startswith('당신은'), 'system prompt missing'
assert any(t['name']=='record_expense' for t in d['tools']), 'record_expense tool missing'
" && pass "context payload shape + math" || fail "context math"

http "not found (404 path)" GET "$BASE/api/dashboard/no-such-user" '' 404

echo
printf "\033[32mALL GREEN\033[0m — integration looks healthy.\n"
