from typing import Optional
from app.exceptions import NotFoundException, ValidationException
from app.repositories.category_repo import CategoryRepository
from app.repositories.transaction_repo import TransactionRepository
from app.schemas.category import CategoryType
from app.schemas.transaction import (
    CreateTransactionInput,
    Transaction,
    TransactionFilters,
    UpdateTransactionInput,
)


class TransactionService:
    def __init__(self, tx_repo: TransactionRepository, cat_repo: CategoryRepository):
        self.tx_repo = tx_repo
        self.cat_repo = cat_repo

    async def create_for_user(
        self, user_id: str, input_data: CreateTransactionInput
    ) -> Transaction:
        await self.assert_category(user_id, input_data.categoryId, input_data.type)
        return await self.tx_repo.create(user_id, input_data)

    async def list_for_user(
        self, user_id: str, filters: Optional[TransactionFilters] = None, limit: int = 100
    ) -> list[Transaction]:
        filters = filters or TransactionFilters()
        return await self.tx_repo.list_for_user(user_id, filters, limit)

    async def update_for_user(
        self, user_id: str, transaction_id: str, input_data: UpdateTransactionInput
    ) -> Transaction:
        existing = await self.tx_repo.find_for_user(user_id, transaction_id)
        if not existing:
            raise NotFoundException("Transaction not found.")

        category_id = input_data.categoryId or existing.categoryId
        tx_type = input_data.type or existing.type
        await self.assert_category(user_id, category_id, tx_type)

        updated = await self.tx_repo.update_for_user(user_id, transaction_id, input_data)
        if not updated:
            raise NotFoundException("Transaction not found.")
        return updated

    async def delete_for_user(self, user_id: str, transaction_id: str) -> None:
        deleted = await self.tx_repo.delete_for_user(user_id, transaction_id)
        if not deleted:
            raise NotFoundException("Transaction not found.")

    async def assert_category(
        self, user_id: str, category_id: str, expected_type: CategoryType
    ) -> None:
        cat = await self.cat_repo.find_available(user_id, category_id)
        if not cat or cat.type != expected_type:
            raise ValidationException("Select a valid category for this transaction type.")
