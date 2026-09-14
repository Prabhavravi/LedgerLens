from typing import Optional
from fastapi import APIRouter, Depends, Header, Request, Response, status

from app.api.deps import SESSION_COOKIE_NAME, get_auth_service, get_current_user
from app.config import settings
from app.schemas.auth import LoginInput, SignUpInput, User
from app.schemas.common import ApiResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_DURATION_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
        secure=(settings.NODE_ENV == "production"),
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=(settings.NODE_ENV == "production"),
    )


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    input_data: SignUpInput,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    user, token = await auth_service.sign_up(input_data)
    _set_session_cookie(response, token)
    return {"ok": True, "data": {"user": user.model_dump()}}


@router.post("/login", status_code=status.HTTP_200_OK)
async def login(
    input_data: LoginInput,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    user, token = await auth_service.login(input_data)
    _set_session_cookie(response, token)
    return {"ok": True, "data": {"user": user.model_dump()}}


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None),
    auth_service: AuthService = Depends(get_auth_service),
):
    token: Optional[str] = None
    if SESSION_COOKIE_NAME in request.cookies:
        token = request.cookies[SESSION_COOKIE_NAME]
    elif authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()

    if token:
        await auth_service.logout(token)

    _clear_session_cookie(response)
    return {"ok": True, "data": None}


@router.get("/me", status_code=status.HTTP_200_OK)
async def me(user: User = Depends(get_current_user)):
    """Server-side identity endpoint used by the Next.js protected layout."""
    return {"ok": True, "data": {"user": user.model_dump()}}
