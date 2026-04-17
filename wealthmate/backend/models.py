"""Pydantic request/response schemas shared across routers."""
from pydantic import BaseModel
from typing import Optional


class AssetCreate(BaseModel):
    name: str
    type: str
    category: str  # 유동/비유동
    amount: int
    return_rate: float = 0.0


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[int] = None
    return_rate: Optional[float] = None


class ExpenseCreate(BaseModel):
    month: str     # YYYY-MM
    category: str  # 식비/교통/주거/쇼핑/여가/저축/기타
    amount: int


class GoalUpdate(BaseModel):
    target_amount: Optional[int] = None
    target_year: Optional[int] = None
    start_amount: Optional[int] = None
    start_date: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    salary: Optional[int] = None
    join_year: Optional[int] = None


class RuleCreate(BaseModel):
    content: str


class RuleUpdate(BaseModel):
    content: str


class ChatRequest(BaseModel):
    user_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    action: Optional[dict] = None
