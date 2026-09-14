from datetime import date
import re
from typing import Optional
from fastapi import APIRouter, Depends, Path, Query, Response, status

from app.api.deps import get_current_user, get_transaction_service
from app.exceptions import ValidationException
from app.schemas.auth import User
from app.schemas.category import CategoryType
from app.schemas.transaction import (
    CreateTransactionInput,
    TransactionFilters,
    UpdateTransactionInput,
)
from app.services.transaction_service import TransactionService

router = APIRouter(prefix="/transactions", tags=["transactions"])
UUID_REGEX = re.compile(r"^[0-9a-fA-F-]{36}$")


def _validate_uuid(id_str: str) -> str:
    if not UUID_REGEX.match(id_str):
        raise ValidationException("Invalid transaction identifier.")
    return id_str


@router.get("", status_code=status.HTTP_200_OK)
async def list_transactions(
    startDate: Optional[date] = Query(None),
    endDate: Optional[date] = Query(None),
    categoryId: Optional[str] = Query(None),
    query: Optional[str] = Query(None, max_length=100),
    sort: str = Query("newest", pattern="^(newest|oldest|amount_desc|amount_asc)$"),
    type: Optional[CategoryType] = Query(None),
    limit: int = Query(default=100, ge=1, le=100),
    user: User = Depends(get_current_user),
    service: TransactionService = Depends(get_transaction_service),
):
    filters = TransactionFilters(
        startDate=startDate,
        endDate=endDate,
        categoryId=categoryId,
        type=type,
        query=query,
        sort=sort,
    )
    items = await service.list_for_user(user.id, filters, limit=limit)
    return {"ok": True, "data": [tx.model_dump() for tx in items]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_transaction(
    input_data: CreateTransactionInput,
    user: User = Depends(get_current_user),
    service: TransactionService = Depends(get_transaction_service),
):
    item = await service.create_for_user(user.id, input_data)
    return {"ok": True, "data": item.model_dump()}


@router.patch("/{id}", status_code=status.HTTP_200_OK)
async def update_transaction(
    id: str = Path(...),
    input_data: UpdateTransactionInput = None,
    user: User = Depends(get_current_user),
    service: TransactionService = Depends(get_transaction_service),
):
    _validate_uuid(id)
    item = await service.update_for_user(user.id, id, input_data)
    return {"ok": True, "data": item.model_dump()}


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    id: str = Path(...),
    user: User = Depends(get_current_user),
    service: TransactionService = Depends(get_transaction_service),
):
    _validate_uuid(id)
    await service.delete_for_user(user.id, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
