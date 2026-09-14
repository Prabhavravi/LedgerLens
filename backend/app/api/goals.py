import re
from typing import Any
from fastapi import APIRouter, Depends, Path, Request, status

from app.api.deps import get_current_user, get_goal_service
from app.exceptions import ValidationException
from app.schemas.auth import User
from app.schemas.goal import (
    ContributeGoalInput,
    CreateGoalInput,
    UpdateGoalInput,
)
from app.services.goal_service import GoalService

router = APIRouter(prefix="/goals", tags=["goals"])
UUID_REGEX = re.compile(r"^[0-9a-fA-F-]{36}$")


def _validate_uuid(id_str: str) -> str:
    if not UUID_REGEX.match(id_str):
        raise ValidationException("Invalid goal identifier.")
    return id_str


@router.get("", status_code=status.HTTP_200_OK)
async def list_goals(
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    goals = await service.list_statuses_for_user(user.id)
    return {"ok": True, "data": [g.model_dump() for g in goals]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_goal(
    input_data: CreateGoalInput,
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    goal = await service.create_for_user(user.id, input_data)
    return {"ok": True, "data": goal.model_dump()}


@router.get("/{id}", status_code=status.HTTP_200_OK)
async def get_goal(
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    _validate_uuid(id)
    goal = await service.get_goal_for_user(user.id, id)
    return {"ok": True, "data": goal.model_dump()}


@router.patch("/{id}", status_code=status.HTTP_200_OK)
async def update_or_contribute_goal(
    request: Request,
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    _validate_uuid(id)
    raw_body = await request.json()

    if "amountCents" in raw_body and len(raw_body) == 1:
        try:
            contrib = ContributeGoalInput.model_validate(raw_body)
        except Exception as e:
            raise ValidationException(f"Invalid contribution amount: {e}")
        updated = await service.contribute_for_user(user.id, id, contrib.amountCents)
        return {"ok": True, "data": updated.model_dump()}

    try:
        update_data = UpdateGoalInput.model_validate(raw_body)
    except Exception as e:
        raise ValidationException(f"Invalid goal update: {e}")

    updated = await service.update_for_user(user.id, id, update_data)
    return {"ok": True, "data": updated.model_dump()}


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_goal(
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    _validate_uuid(id)
    await service.delete_for_user(user.id, id)
    return {"ok": True, "data": {"message": "Goal deleted successfully."}}


@router.get("/{id}/plan", status_code=status.HTTP_200_OK)
async def get_goal_action_plan(
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: GoalService = Depends(get_goal_service),
):
    _validate_uuid(id)
    plan = await service.get_action_plan_for_goal(user.id, id)
    return {"ok": True, "data": plan.model_dump()}
