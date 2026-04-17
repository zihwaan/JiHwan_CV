"""
WealthMate FastAPI entrypoint.

Run locally:
    uvicorn main:app --reload --port 8000
"""
import asyncio
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Windows: asyncio subprocess 는 ProactorEventLoop 에서만 동작.
# uvicorn 기본이지만 SelectorEventLoop 로 바뀐 환경을 방어적으로 처리.
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

from database import init_db
from routers import (
    assets, expenses, incomes, goals, dashboard, chat,
    rules, profile, context, auth, gate, manage,
)

# Load backend/.env into os.environ before anything else — that file is
# how operators set WEALTHMATE_ACCESS_PIN + any other per-deploy config.
gate._load_env_file()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # populate os.environ["ANTHROPIC_API_KEY"] from the saved-keys store so
    # the agent works immediately on first request without waiting for the
    # frontend to activate a key.
    auth.load_active_key_on_startup()
    yield


app = FastAPI(title="WealthMate API", lifespan=lifespan)

# CORS: when the access PIN is configured (production deploy), lock origins
# to a known allowlist. In dev (no PIN) we keep `*` for vite hot-reload
# friendliness. Operators can override via WEALTHMATE_ALLOWED_ORIGINS
# (comma-separated).
_pin_active = bool(os.environ.get("WEALTHMATE_ACCESS_PIN"))
_default_origins = [
    "https://zihwan.com",
    "https://www.zihwan.com",
    "http://localhost:5173",
    "http://localhost:8082",
]
_configured = os.environ.get("WEALTHMATE_ALLOWED_ORIGINS", "")
allowed_origins = (
    [o.strip() for o in _configured.split(",") if o.strip()]
    if _configured
    else (_default_origins if _pin_active else ["*"])
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    # x-wm-pin must be in the allowlist so browsers can send it on preflight.
    allow_headers=["*", "x-wm-pin"],
    expose_headers=["x-wm-pin-required"],
)

# Access-PIN gate — wraps every /api/* except /api/auth/gate_status + probes.
# No-op if WEALTHMATE_ACCESS_PIN is unset.
app.middleware("http")(gate.gate_middleware)

app.include_router(assets.router)
app.include_router(expenses.router)
app.include_router(incomes.router)
app.include_router(goals.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(rules.router)
app.include_router(profile.router)
app.include_router(context.router)
app.include_router(auth.router)
app.include_router(gate.router)
app.include_router(manage.router)


@app.get("/")
async def root():
    return {"service": "wealthmate", "status": "ok"}
