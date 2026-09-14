from datetime import date
import pytest
from app.schemas.auth import User
from app.schemas.budget import CreateBudgetInput
from app.schemas.goal import CreateGoalInput, UpdateGoalInput
from app.schemas.transaction import CreateTransactionInput
from app.exceptions import ValidationException

USER = User(id="user-test-logic-1234", email="logic@example.com")


@pytest.mark.asyncio
async def test_budget_utilization_and_status(in_memory_services):
    budget_svc = in_memory_services["budget"]
    tx_svc = in_memory_services["tx"]

    # Create budget of ₹10,000 for groceries in 2026-09
    await budget_svc.create_for_user(
        USER.id,
        CreateBudgetInput(
            categoryId="11111111-1111-4111-8111-111111111111",
            amountCents=1000000,
            month="2026-09",
        ),
    )

    # Add ₹7,500 expense (75% - on_track)
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="expense",
            amountCents=750000,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Groceries week 1",
            occurredOn=date(2026, 9, 5),
        ),
    )

    statuses = await budget_svc.list_statuses_for_user(USER.id, "2026-09")
    assert len(statuses) == 1
    assert statuses[0].spentCents == 750000
    assert statuses[0].remainingCents == 250000
    assert statuses[0].percentageUsed == 75.0
    assert statuses[0].status == "on_track"

    # Add ₹1,000 expense (85% total - warning)
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="expense",
            amountCents=100000,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Groceries week 2",
            occurredOn=date(2026, 9, 12),
        ),
    )
    statuses = await budget_svc.list_statuses_for_user(USER.id, "2026-09")
    assert statuses[0].spentCents == 850000
    assert statuses[0].status == "warning"

    # Add ₹2,000 expense (105% total - exceeded)
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="expense",
            amountCents=200000,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Groceries week 3",
            occurredOn=date(2026, 9, 20),
        ),
    )
    statuses = await budget_svc.list_statuses_for_user(USER.id, "2026-09")
    assert statuses[0].spentCents == 1050000
    assert statuses[0].remainingCents == -50000
    assert statuses[0].status == "exceeded"


@pytest.mark.asyncio
async def test_analytics_savings_rate_and_net_savings(in_memory_services):
    analytics_svc = in_memory_services["analytics"]
    tx_svc = in_memory_services["tx"]

    # ₹1,00,000 income
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="income",
            amountCents=10000000,
            categoryId="33333333-3333-4333-8333-333333333333",
            description="Salary",
            occurredOn=date(2026, 9, 1),
        ),
    )
    # ₹30,000 expense
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="expense",
            amountCents=3000000,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Groceries",
            occurredOn=date(2026, 9, 10),
        ),
    )

    summary = await analytics_svc.get_financial_summary(USER.id, "2026-09")
    assert summary.incomeCents == 10000000
    assert summary.expenseCents == 3000000
    assert summary.netSavingsCents == 7000000
    assert summary.savingsRate == 70.0


@pytest.mark.asyncio
async def test_goal_action_plan_deterministic_math(in_memory_services):
    goal_svc = in_memory_services["goal"]
    tx_svc = in_memory_services["tx"]

    # Target date: end of current year
    goal = await goal_svc.create_for_user(
        USER.id,
        CreateGoalInput(
            name="Buy Laptop",
            targetAmountCents=6000000,  # ₹60,000
            currentSavedCents=1000000,  # ₹10,000
            targetDate=date(2026, 12, 31),
        ),
    )

    # User has net savings of ₹20,000 in current month
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="income",
            amountCents=5000000,
            categoryId="33333333-3333-4333-8333-333333333333",
            description="Salary",
            occurredOn=date(2026, 9, 1),
        ),
    )
    await tx_svc.create_for_user(
        USER.id,
        CreateTransactionInput(
            type="expense",
            amountCents=1500000,
            categoryId="22222222-2222-4222-8222-222222222222",
            description="Dining out",
            occurredOn=date(2026, 9, 5),
        ),
    )

    plan = await goal_svc.get_action_plan_for_goal(USER.id, goal.id)
    facts = plan.calculatedFacts

    assert facts.targetAmountCents == 6000000
    assert facts.currentSavedCents == 1000000
    assert facts.remainingAmountCents == 5000000
    assert facts.percentageCompleted == 16.67
    assert facts.remainingMonths >= 1
    # Ceiling division check: remainingMonths * requiredMonthlySavings >= remainingAmount
    assert facts.requiredMonthlySavingsCents * facts.remainingMonths >= facts.remainingAmountCents

    # Check spending adjustment opportunities identify dining
    assert any(opp.categoryName == "Dining" for opp in plan.spendingAdjustmentOpportunities)


@pytest.mark.asyncio
async def test_goal_target_invariant_is_preserved_after_creation(in_memory_services):
    goal_svc = in_memory_services["goal"]
    goal = await goal_svc.create_for_user(
        USER.id,
        CreateGoalInput(
            name="Emergency fund",
            targetAmountCents=10_000,
            currentSavedCents=9_000,
            targetDate=date(2026, 12, 31),
        ),
    )

    with pytest.raises(ValidationException):
        await goal_svc.contribute_for_user(USER.id, goal.id, 1_001)

    with pytest.raises(ValidationException):
        await goal_svc.update_for_user(
            USER.id, goal.id, UpdateGoalInput(targetAmountCents=8_999)
        )
