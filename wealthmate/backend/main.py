"""
WealthMate FastAPI entrypoint.

Run locally:
    uvicorn main:app --reload --port 8000
"""
import asyncio
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
    rules, profile, context, auth,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # populate os.environ["ANTHROPIC_API_KEY"] from the saved-keys store so
    # the agent works immediately on first request without waiting for the
    # frontend to activate a key.
    auth.load_active_key_on_startup()
    yield


app = FastAPI(title="WealthMate API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/")
async def root():
    return {"service": "wealthmate", "status": "ok"}
