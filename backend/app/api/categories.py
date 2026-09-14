import re
from fastapi import APIRouter, Depends, Path, Response, status

from app.api.deps import get_category_service, get_current_user
from app.exceptions import ValidationException
from app.schemas.auth import User
from app.schemas.category import CategoryInput, UpdateCategoryInput
from app.services.category_service import CategoryService

router = APIRouter(prefix="/categories", tags=["categories"])
UUID_REGEX = re.compile(r"^[0-9a-fA-F-]{36}$")


def _validate_uuid(id_str: str) -> str:
    if not UUID_REGEX.match(id_str):
        raise ValidationException("Invalid category identifier.")
    return id_str


@router.get("", status_code=status.HTTP_200_OK)
async def list_categories(
    user: User = Depends(get_current_user),
    service: CategoryService = Depends(get_category_service),
):
    categories = await service.list_for_user(user.id)
    return {"ok": True, "data": [c.model_dump() for c in categories]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    input_data: CategoryInput,
    user: User = Depends(get_current_user),
    service: CategoryService = Depends(get_category_service),
):
    category = await service.create_for_user(user.id, input_data)
    return {"ok": True, "data": category.model_dump()}


@router.patch("/{id}", status_code=status.HTTP_200_OK)
async def update_category(
    id: str = Path(...),
    input_data: UpdateCategoryInput = None,
    user: User = Depends(get_current_user),
    service: CategoryService = Depends(get_category_service),
):
    _validate_uuid(id)
    category = await service.update_for_user(user.id, id, input_data)
    return {"ok": True, "data": category.model_dump()}


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: CategoryService = Depends(get_category_service),
):
    _validate_uuid(id)
    await service.delete_for_user(user.id, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
