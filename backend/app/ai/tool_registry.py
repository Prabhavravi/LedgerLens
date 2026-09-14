from datetime import datetime, timezone
import time
from typing import Any, Callable, Coroutine, Optional, Type
from pydantic import BaseModel, ValidationError as PydanticValidationError
from app.exceptions import AppException, ForbiddenException, ValidationException
from app.schemas.auth import User


def contains_identity_key(value: Any) -> bool:
    if isinstance(value, list):
        return any(contains_identity_key(item) for item in value)
    if not isinstance(value, dict):
        return False
    return any(
        k in ("userId", "user_id") or contains_identity_key(v)
        for k, v in value.items()
    )


class RegisteredTool:
    def __init__(
        self,
        name: str,
        description: str,
        schema_class: Type[BaseModel],
        execute_fn: Callable[[Any, User], Coroutine[Any, Any, Any]],
    ):
        self.name = name
        self.description = description
        self.schema_class = schema_class
        self.execute_fn = execute_fn


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, RegisteredTool] = {}

    def register(
        self,
        name: str,
        description: str,
        schema_class: Type[BaseModel],
        execute_fn: Callable[[Any, User], Coroutine[Any, Any, Any]],
    ) -> None:
        if name in self._tools:
            raise ValueError(f"Duplicate tool: {name}")
        self._tools[name] = RegisteredTool(name, description, schema_class, execute_fn)

    def metadata(self) -> list[dict[str, Any]]:
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.schema_class.model_json_schema(),
            }
            for tool in self._tools.values()
        ]

    async def execute(self, name: str, raw_input: dict[str, Any], user: User) -> Any:
        if contains_identity_key(raw_input):
            raise ForbiddenException("AI tools cannot receive a user identifier.")

        tool = self._tools.get(name)
        if not tool:
            raise ValidationException("Unknown AI tool.")

        unknown_fields = set(raw_input) - set(tool.schema_class.model_fields)
        if unknown_fields:
            raise ValidationException("Invalid AI tool input.")

        try:
            parsed = tool.schema_class.model_validate(raw_input)
        except (PydanticValidationError, ValueError) as err:
            raise ValidationException(f"Invalid AI tool input: {err}")

        started_at = time.time()
        is_write = name.startswith("create_") or name.startswith("update_")
        audit = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "userId": user.id,
            "tool": name,
            "actionType": "write" if is_write else "read",
            "inputKeys": list(raw_input.keys()),
        }

        try:
            output = await tool.execute_fn(parsed, user)
            duration_ms = int((time.time() - started_at) * 1000)
            print(f"[AI Tool Success] {audit['tool']} user={audit['userId']} duration={duration_ms}ms")
            return output
        except Exception as error:
            duration_ms = int((time.time() - started_at) * 1000)
            code = error.code if isinstance(error, AppException) else "INTERNAL_ERROR"
            print(f"[AI Tool Failure] {audit['tool']} code={code} duration={duration_ms}ms")
            raise
