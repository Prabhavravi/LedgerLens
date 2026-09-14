from typing import Optional
from app.exceptions import NotFoundException
from app.repositories.category_repo import CategoryRepository
from app.schemas.category import Category, CategoryInput, CategoryType, UpdateCategoryInput


class CategoryService:
    def __init__(self, repo: CategoryRepository):
        self.repo = repo

    async def list_for_user(self, user_id: str) -> list[Category]:
        return await self.repo.list_available(user_id)

    async def resolve_for_user(self, user_id: str, name: str, cat_type: CategoryType) -> Category:
        categories = await self.repo.list_available(user_id)
        name_clean = name.strip().lower()
        matches = [
            c for c in categories
            if c.type == cat_type and c.name.strip().lower() == name_clean
        ]
        if len(matches) != 1:
            raise NotFoundException("A matching category was not found. Please choose a category.")
        return matches[0]

    async def create_for_user(self, user_id: str, input_data: CategoryInput) -> Category:
        return await self.repo.create(user_id, input_data)

    async def update_for_user(
        self, user_id: str, category_id: str, input_data: UpdateCategoryInput
    ) -> Category:
        updated = await self.repo.update_private(user_id, category_id, input_data)
        if not updated:
            raise NotFoundException("Private category not found.")
        return updated

    async def delete_for_user(self, user_id: str, category_id: str) -> None:
        deleted = await self.repo.delete_private(user_id, category_id)
        if not deleted:
            raise NotFoundException("Private category not found.")
