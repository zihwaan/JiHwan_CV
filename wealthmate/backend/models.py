"""Pydantic request/response schemas shared across routers."""
from pydantic import BaseModel, Field, field_validator
from typing import Optional

# Bounded by SQLite's expenses UNIQUE(user_id, month, category) and the
# rule-evaluator / chart builders that rely on `YYYY-MM` sort order.
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


def _must_be_month(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    import re
    if not re.match(MONTH_PATTERN, v):
        raise ValueError("month must be YYYY-MM (e.g. 2026-04)")
    return v


class AssetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    type: str
    category: str  # 유동/비유동
    amount: int = Field(ge=0)
    return_rate: float = 0.0


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    type: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[int] = Field(default=None, ge=0)
    return_rate: Optional[float] = None


class ExpenseCreate(BaseModel):
    month: str     # YYYY-MM
    category: str  # 식비/교통/주거/쇼핑/여가/저축/기타
    amount: int = Field(ge=0)

    @field_validator("month")
    @classmethod
    def _m(cls, v): return _must_be_month(v)


class GoalUpdate(BaseModel):
    target_amount: Optional[int] = Field(default=None, ge=0)
    target_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    start_amount: Optional[int] = Field(default=None, ge=0)
    start_date: Optional[str] = None

    @field_validator("start_date")
    @classmethod
    def _sd(cls, v): return _must_be_month(v)


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
