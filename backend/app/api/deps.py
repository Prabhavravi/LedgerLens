from typing import Optional
import asyncpg
from fastapi import Depends, Header, Request

from app.config import settings
from app.db.pool import get_db_pool
from app.db.tenant import TenantDatabase
from app.exceptions import UnauthorizedException
from app.repositories.analytics_repo import AnalyticsRepository
from app.repositories.auth_repo import AuthRepository
from app.repositories.budget_repo import BudgetRepository
from app.repositories.category_repo import CategoryRepository
from app.repositories.goal_repo import GoalRepository
from app.repositories.transaction_repo import TransactionRepository
from app.schemas.auth import User
from app.services.analytics_service import AnalyticsService
from app.services.auth_service import AuthService
from app.services.budget_service import BudgetService
from app.services.category_service import CategoryService
from app.services.goal_service import GoalService
from app.services.insight_service import InsightService
from app.services.transaction_service import TransactionService
from app.ai.tools import create_financial_tool_registry
from app.ai.orchestrator import FinancialAssistantOrchestrator
from app.ai.provider import get_assistant_model

SESSION_COOKIE_NAME = settings.SESSION_COOKIE_NAME


async def get_db() -> asyncpg.Pool:
    return await get_db_pool()


def get_auth_service(pool: asyncpg.Pool = Depends(get_db)) -> AuthService:
    return AuthService(AuthRepository(pool))



async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    token: Optional[str] = None

    # 1. Try session cookie
    if SESSION_COOKIE_NAME in request.cookies:
        token = request.cookies[SESSION_COOKIE_NAME]

    # 2. Fallback to Authorization: Bearer <token>
    elif authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()

    if not token:
        raise UnauthorizedException("Authentication required.")

    user = await auth_service.get_user_for_token(token)
    if not user:
        raise UnauthorizedException("Authentication required.")

    return user


async def get_tenant_db(
    user: User = Depends(get_current_user), pool: asyncpg.Pool = Depends(get_db)
) -> TenantDatabase:
    return TenantDatabase(pool, user.id)


# Every financial service receives the authenticated request's database context.
def get_category_service(pool: TenantDatabase = Depends(get_tenant_db)) -> CategoryService:
    return CategoryService(CategoryRepository(pool))


def get_transaction_service(pool: TenantDatabase = Depends(get_tenant_db)) -> TransactionService:
    return TransactionService(TransactionRepository(pool), CategoryRepository(pool))


def get_budget_service(pool: TenantDatabase = Depends(get_tenant_db)) -> BudgetService:
    return BudgetService(BudgetRepository(pool), CategoryRepository(pool))


def get_goal_service(pool: TenantDatabase = Depends(get_tenant_db)) -> GoalService:
    budget_svc = BudgetService(BudgetRepository(pool), CategoryRepository(pool))
    return GoalService(GoalRepository(pool), AnalyticsService(AnalyticsRepository(pool), budget_svc))


def get_analytics_service(pool: TenantDatabase = Depends(get_tenant_db)) -> AnalyticsService:
    budget_svc = BudgetService(BudgetRepository(pool), CategoryRepository(pool))
    return AnalyticsService(AnalyticsRepository(pool), budget_svc)


def get_insight_service(pool: TenantDatabase = Depends(get_tenant_db)) -> InsightService:
    budget_svc = BudgetService(BudgetRepository(pool), CategoryRepository(pool))
    return InsightService(AnalyticsService(AnalyticsRepository(pool), budget_svc))


def get_ai_orchestrator(pool: TenantDatabase = Depends(get_tenant_db)) -> FinancialAssistantOrchestrator:
    registry = create_financial_tool_registry(pool)
    return FinancialAssistantOrchestrator(get_assistant_model(), registry)
