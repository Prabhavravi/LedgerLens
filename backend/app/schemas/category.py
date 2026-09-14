from typing import Literal, Optional
from pydantic import BaseModel, Field

CategoryType = Literal["income", "expense"]


class Category(BaseModel):
    id: str
    userId: Optional[str] = None
    name: str
    type: CategoryType


class CategoryInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    type: CategoryType


class UpdateCategoryInput(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    type: Optional[CategoryType] = None
