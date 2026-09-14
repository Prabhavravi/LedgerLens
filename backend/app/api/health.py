from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"ok": True, "service": "ai-powered-expense-tracker"}
