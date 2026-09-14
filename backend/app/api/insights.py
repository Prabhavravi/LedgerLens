from datetime import datetime, timezone
import re
from typing import Optional
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user, get_insight_service
from app.exceptions import ValidationException
from app.schemas.auth import User
from app.services.insight_service import InsightService

router = APIRouter(prefix="/insights", tags=["insights"])
MONTH_REGEX = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@router.get("", status_code=status.HTTP_200_OK)
async def get_insights(
    month: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    service: InsightService = Depends(get_insight_service),
):
    period = month or datetime.now(timezone.utc).strftime("%Y-%m")
    if not MONTH_REGEX.match(period):
        raise ValidationException("Invalid insight period.")

    insights = await service.get_insights(user.id, period)
    return {"ok": True, "data": [i.model_dump() for i in insights]}
