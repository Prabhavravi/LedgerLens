from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=20)


class PendingAction(BaseModel):
    tool: str
    input: dict[str, Any]
    title: str


class Activity(BaseModel):
    tool: str
    label: str
    status: Literal["completed", "awaiting_confirmation", "failed"]


class AssistantReply(BaseModel):
    message: str
    activities: list[Activity] = []
    pendingActions: list[PendingAction] = []


class ActionConfirmationInput(BaseModel):
    tool: str
    input: dict[str, Any]


class ActionConfirmationResult(BaseModel):
    tool: str
    result: Any
    message: str


class DirectToolExecutionRequest(BaseModel):
    tool: str
    input: dict[str, Any]
