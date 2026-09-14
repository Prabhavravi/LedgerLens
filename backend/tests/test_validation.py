from datetime import date
from pydantic import ValidationError
import pytest

from app.schemas.auth import LoginInput, SignUpInput
from app.schemas.budget import CreateBudgetInput
from app.schemas.goal import CreateGoalInput, UpdateGoalInput
from app.schemas.transaction import CreateTransactionInput


def test_transaction_input_validation():
    # Valid transaction
    valid = CreateTransactionInput(
        type="expense",
        amountCents=1500,
        categoryId="11111111-1111-4111-8111-111111111111",
        description="Coffee",
        occurredOn=date(2026, 9, 11),
    )
    assert valid.amountCents == 1500

    # Non-positive amount
    with pytest.raises(ValidationError):
        CreateTransactionInput(
            type="expense",
            amountCents=0,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Zero amount",
            occurredOn=date(2026, 9, 11),
        )

    with pytest.raises(ValidationError):
        CreateTransactionInput(
            type="expense",
            amountCents=-500,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Negative amount",
            occurredOn=date(2026, 9, 11),
        )

    # Exceeding maximum transaction amount (₹10,00,000 = 100,000,000 cents)
    with pytest.raises(ValidationError):
        CreateTransactionInput(
            type="expense",
            amountCents=100000001,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Too big",
            occurredOn=date(2026, 9, 11),
        )

    # Missing / empty description
    with pytest.raises(ValidationError):
        CreateTransactionInput(
            type="expense",
            amountCents=100,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="",
            occurredOn=date(2026, 9, 11),
        )


def test_budget_input_validation():
    # Valid budget
    valid = CreateBudgetInput(
        categoryId="11111111-1111-4111-8111-111111111111",
        amountCents=500000,
        month="2026-09",
    )
    assert valid.month == "2026-09"

    # Invalid month formats
    with pytest.raises(ValidationError):
        CreateBudgetInput(categoryId="11111111-1111-4111-8111-111111111111", amountCents=500, month="2026-13")

    with pytest.raises(ValidationError):
        CreateBudgetInput(categoryId="11111111-1111-4111-8111-111111111111", amountCents=500, month="2026-00")

    with pytest.raises(ValidationError):
        CreateBudgetInput(categoryId="11111111-1111-4111-8111-111111111111", amountCents=500, month="invalid")

    # Non-positive budget amount
    with pytest.raises(ValidationError):
        CreateBudgetInput(categoryId="11111111-1111-4111-8111-111111111111", amountCents=0, month="2026-09")


def test_goal_input_validation():
    # Valid goal
    valid = CreateGoalInput(
        name="Emergency Fund",
        targetAmountCents=10000000,
        currentSavedCents=2000000,
        targetDate=date(2026, 12, 31),
    )
    assert valid.targetAmountCents == 10000000

    # currentSaved > targetAmount
    with pytest.raises(ValidationError):
        CreateGoalInput(
            name="Overfunded",
            targetAmountCents=100000,
            currentSavedCents=200000,
            targetDate=date(2026, 12, 31),
        )

    # Exceeding maximum target amount (₹1,00,00,000 = 1,000,000,000 cents)
    with pytest.raises(ValidationError):
        CreateGoalInput(
            name="Too ambitious",
            targetAmountCents=1000000001,
            currentSavedCents=0,
            targetDate=date(2026, 12, 31),
        )


def test_auth_input_validation():
    # Valid signup
    valid = SignUpInput(email="test@example.com", password="password1234")
    assert valid.email == "test@example.com"

    # Short password
    with pytest.raises(ValidationError):
        SignUpInput(email="test@example.com", password="short")

    # Invalid email
    with pytest.raises(ValidationError):
        SignUpInput(email="not-an-email", password="password1234")
