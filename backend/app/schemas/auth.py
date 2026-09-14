from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    id: str
    email: str


class SignUpInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class AuthResult(BaseModel):
    user: User
