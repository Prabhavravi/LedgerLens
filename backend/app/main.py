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

# Include routers for both /api/v1 and /api
for prefix in ("/api/v1", "/api"):
    app.include_router(health.router, prefix=prefix)
    app.include_router(auth.router, prefix=prefix)
    app.include_router(categories.router, prefix=prefix)
    app.include_router(transactions.router, prefix=prefix)
    app.include_router(budgets.router, prefix=prefix)
    app.include_router(goals.router, prefix=prefix)
    app.include_router(analytics.router, prefix=prefix)
    app.include_router(insights.router, prefix=prefix)
    app.include_router(ai.router, prefix=prefix)


@app.get("/")
async def root():
    return {"message": "LedgerLens FastAPI Backend"}
