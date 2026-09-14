import re
from fastapi import APIRouter, Depends, Path, Query, Response, status

from app.api.deps import get_budget_service, get_current_user
from app.exceptions import ValidationException
from app.schemas.auth import User
from app.schemas.budget import CreateBudgetInput, UpdateBudgetInput
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/budgets", tags=["budgets"])
UUID_REGEX = re.compile(r"^[0-9a-fA-F-]{36}$")
MONTH_REGEX = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_uuid(id_str: str) -> str:
    if not UUID_REGEX.match(id_str):
        raise ValidationException("Invalid budget identifier.")
    return id_str


@router.get("", status_code=status.HTTP_200_OK)
async def list_budgets(
    month: str = Query(...),
    user: User = Depends(get_current_user),
    service: BudgetService = Depends(get_budget_service),
):
    if not MONTH_REGEX.match(month):
        raise ValidationException("Invalid budget period.")
    statuses = await service.list_statuses_for_user(user.id, month)
    return {"ok": True, "data": [s.model_dump() for s in statuses]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_budget(
    input_data: CreateBudgetInput,
    user: User = Depends(get_current_user),
    service: BudgetService = Depends(get_budget_service),
):
    budget = await service.create_for_user(user.id, input_data)
    return {"ok": True, "data": budget.model_dump()}


@router.patch("/{id}", status_code=status.HTTP_200_OK)
async def update_budget(
    id: str = Path(...),
    input_data: UpdateBudgetInput = None,
    user: User = Depends(get_current_user),
    service: BudgetService = Depends(get_budget_service),
):
    _validate_uuid(id)
    budget = await service.update_for_user(user.id, id, input_data)
    return {"ok": True, "data": budget.model_dump()}


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: BudgetService = Depends(get_budget_service),
):
    _validate_uuid(id)
    await service.delete_for_user(user.id, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
