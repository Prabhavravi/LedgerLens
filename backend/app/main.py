from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai,
    analytics,
    auth,
    budgets,
    categories,
    goals,
    health,
    insights,
    transactions,
)
from app.config import settings
from app.db.pool import close_db_pool, get_db_pool
from app.exceptions import (
    AppException,
    app_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database connection pool
    pool = await get_db_pool()
    print("[Startup] Database connection pool initialized.")
    yield
    # Shutdown: close database connection pool
    await close_db_pool()
    print("[Shutdown] Database connection pool closed.")


app = FastAPI(
    title="LedgerLens API",
    description="Python FastAPI backend for LedgerLens expense tracker",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    # Kept in server-only configuration so a deployed frontend can be added
    # deliberately without opening credentialed cross-origin requests to all
    # origins.
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# One versioned API, reached by the frontend through /backend-api/*.
for router in (
    health.router, auth.router, categories.router, transactions.router,
    budgets.router, goals.router, analytics.router, insights.router, ai.router,
):
    app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "LedgerLens FastAPI Backend"}
