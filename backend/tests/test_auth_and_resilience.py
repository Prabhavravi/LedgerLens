from datetime import datetime, timedelta, timezone
import pytest

from app.exceptions import (
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)
from app.schemas.auth import LoginInput, SignUpInput
from app.services.auth_service import (
    AuthService,
    hash_password,
    hash_session_token,
    verify_password,
)


def test_password_hashing_and_verification():
    password = "super-secret-password-123"
    hashed = hash_password(password)

    assert hashed.startswith("scrypt$")
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False
    assert verify_password(password, "invalid$format") is False


@pytest.mark.asyncio
async def test_auth_service_lifecycle(in_memory_repos):
    auth_svc = AuthService(in_memory_repos["auth"])

    # Sign up
    user, token = await auth_svc.sign_up(
        SignUpInput(email="fresh@example.com", password="password1234")
    )
    assert user.email == "fresh@example.com"
    assert token is not None

    # Get user for session token
    fetched_user = await auth_svc.get_user_for_token(token)
    assert fetched_user is not None
    assert fetched_user.id == user.id

    # Duplicate sign up fails
    with pytest.raises(ValidationException):
        await auth_svc.sign_up(
            SignUpInput(email="fresh@example.com", password="password1234")
        )

    # Login with valid password
    logged_in_user, new_token = await auth_svc.login(
        LoginInput(email="fresh@example.com", password="password1234")
    )
    assert logged_in_user.id == user.id

    # Login with invalid password
    with pytest.raises(UnauthorizedException):
        await auth_svc.login(
            LoginInput(email="fresh@example.com", password="wrongpassword")
        )

    # Logout revokes session
    await auth_svc.logout(token)
    assert await auth_svc.get_user_for_token(token) is None


@pytest.mark.asyncio
async def test_expired_session_handling(in_memory_repos):
    auth_svc = AuthService(in_memory_repos["auth"])
    user, token = await auth_svc.sign_up(
        SignUpInput(email="expired@example.com", password="password1234")
    )

    # Artificially expire the session
    token_hash = hash_session_token(token)
    in_memory_repos["auth"].sessions[token_hash]["expiresAt"] = datetime.now(
        timezone.utc
    ) - timedelta(days=1)

    # Expired session must return None
    assert await auth_svc.get_user_for_token(token) is None


def test_exception_properties():
    unauth = UnauthorizedException()
    assert unauth.status_code == 401
    assert unauth.code == "UNAUTHORIZED"

    forbidden = ForbiddenException()
    assert forbidden.status_code == 403
    assert forbidden.code == "FORBIDDEN"

    val_err = ValidationException("Bad data")
    assert val_err.status_code == 400
    assert val_err.code == "VALIDATION_ERROR"

    not_found = NotFoundException("Missing item")
    assert not_found.status_code == 404
    assert not_found.code == "NOT_FOUND"
