from datetime import datetime, timezone
import re
from typing import Optional
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_analytics_service, get_current_user
from app.exceptions import ValidationException
from app.schemas.auth import User
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])
MONTH_REGEX = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@router.get("/dashboard", status_code=status.HTTP_200_OK)
async def get_dashboard(
    month: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    service: AnalyticsService = Depends(get_analytics_service),
):
    period = month or datetime.now(timezone.utc).strftime("%Y-%m")
    if not MONTH_REGEX.match(period):
        raise ValidationException("Invalid analytics period.")

    data = await service.get_dashboard(user.id, period)
    return {"ok": True, "data": data.model_dump()}
