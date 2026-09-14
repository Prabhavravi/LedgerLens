from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Optional
from app.config import settings
from app.exceptions import UnauthorizedException, ValidationException
from app.repositories.auth_repo import AuthRepository
from app.schemas.auth import LoginInput, SignUpInput, User


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=16384,
        r=8,
        p=1,
        maxmem=0,
        dklen=64,
    )
    return f"scrypt${salt}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    parts = encoded.split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    salt = parts[1]
    expected_hex = parts[2]
    try:
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt.encode("utf-8"),
            n=16384,
            r=8,
            p=1,
            maxmem=0,
            dklen=64,
        )
        return hmac.compare_digest(derived.hex(), expected_hex)
    except Exception:
        return False


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AuthService:
    def __init__(self, repo: AuthRepository):
        self.repo = repo

    async def sign_up(self, input_data: SignUpInput) -> tuple[User, str]:
        existing = await self.repo.find_user_by_email(input_data.email)
        if existing:
            raise ValidationException("Unable to create account with these credentials.")

        pwd_hash = hash_password(input_data.password)
        user = await self.repo.create_user(input_data.email, pwd_hash)
        token = await self.issue_session(user.id)
        return user, token

    async def login(self, input_data: LoginInput) -> tuple[User, str]:
        record = await self.repo.find_user_by_email(input_data.email)
        if not record or not verify_password(input_data.password, record["passwordHash"]):
            raise UnauthorizedException()

        user = User(id=str(record["id"]), email=record["email"])
        token = await self.issue_session(user.id)
        return user, token

    async def get_user_for_token(self, token: str) -> Optional[User]:
        token_hash = hash_session_token(token)
        session = await self.repo.find_session(token_hash)
        if not session:
            return None

        now = datetime.now(timezone.utc)
        expires_at = session["expiresAt"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if session["revokedAt"] is not None or expires_at <= now:
            if session["revokedAt"] is None:
                await self.repo.revoke_session(token_hash)
            return None

        return session["user"]

    async def logout(self, token: str) -> None:
        token_hash = hash_session_token(token)
        await self.repo.revoke_session(token_hash)

    async def issue_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hash_session_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.SESSION_DURATION_SECONDS)
        await self.repo.create_session(user_id, token_hash, expires_at)
        return token
