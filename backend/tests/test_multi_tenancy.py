from datetime import date
import pytest
from app.ai.tools import ToolServices, register_financial_tools
from app.ai.tool_registry import ToolRegistry
from app.exceptions import AppException, NotFoundException, ValidationException
from app.schemas.auth import User
from app.schemas.budget import CreateBudgetInput, UpdateBudgetInput
from app.schemas.category import CategoryInput, UpdateCategoryInput
from app.schemas.goal import CreateGoalInput, UpdateGoalInput
from app.schemas.transaction import (
    CreateTransactionInput,
    TransactionFilters,
    UpdateTransactionInput,
)

USER_A = User(id="user-a-1111-1111-1111-111111111111", email="alice@example.com")
USER_B = User(id="user-b-2222-2222-2222-222222222222", email="bob@example.com")


@pytest.mark.asyncio
async def test_transaction_multi_tenancy(in_memory_services):
    tx_svc = in_memory_services["tx"]

    # User A creates a transaction
    tx_a = await tx_svc.create_for_user(
        USER_A.id,
        CreateTransactionInput(
            type="expense",
            amountCents=500000,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Alice Groceries",
            occurredOn=date(2026, 9, 1),
        ),
    )

    # User B listing transactions sees 0
    txs_b = await tx_svc.list_for_user(USER_B.id, TransactionFilters())
    assert len(txs_b) == 0

    # User B attempting to update Alice's transaction raises NotFoundException
    with pytest.raises(NotFoundException):
        await tx_svc.update_for_user(
            USER_B.id,
            tx_a.id,
            UpdateTransactionInput(description="Hacked by Bob"),
        )

    # User A's transaction remains unaltered
    txs_a = await tx_svc.list_for_user(USER_A.id, TransactionFilters())
    assert len(txs_a) == 1
    assert txs_a[0].description == "Alice Groceries"

    # User B attempting to delete Alice's transaction raises NotFoundException
    with pytest.raises(NotFoundException):
        await tx_svc.delete_for_user(USER_B.id, tx_a.id)

    # Transaction still exists for User A
    assert len(await tx_svc.list_for_user(USER_A.id, TransactionFilters())) == 1


@pytest.mark.asyncio
async def test_category_isolation_and_cross_tenant_prevention(in_memory_services):
    cat_svc = in_memory_services["cat"]
    tx_svc = in_memory_services["tx"]
    budget_svc = in_memory_services["budget"]

    # User A creates private category
    alice_cat = await cat_svc.create_for_user(
        USER_A.id,
        CategoryInput(name="Alice Private Stash", type="expense"),
    )

    # User B lists categories: must not see Alice's private category
    bob_cats = await cat_svc.list_for_user(USER_B.id)
    assert not any(c.id == alice_cat.id for c in bob_cats)

    # User B cannot update Alice's private category
    with pytest.raises(NotFoundException):
        await cat_svc.update_for_user(
            USER_B.id, alice_cat.id, UpdateCategoryInput(name="Bob Overwrite")
        )

    # User B cannot delete Alice's private category
    with pytest.raises(NotFoundException):
        await cat_svc.delete_for_user(USER_B.id, alice_cat.id)

    # User B cannot create transaction with Alice's private category
    with pytest.raises(ValidationException):
        await tx_svc.create_for_user(
            USER_B.id,
            CreateTransactionInput(
                type="expense",
                amountCents=10000,
                categoryId=alice_cat.id,
                description="Unauthorized tx",
                occurredOn=date(2026, 9, 2),
            ),
        )

    # User B cannot create budget with Alice's private category
    with pytest.raises(ValidationException):
        await budget_svc.create_for_user(
            USER_B.id,
            CreateBudgetInput(
                categoryId=alice_cat.id,
                amountCents=50000,
                month="2026-09",
            ),
        )


@pytest.mark.asyncio
async def test_budget_multi_tenancy(in_memory_services):
    budget_svc = in_memory_services["budget"]

    # User A creates budget
    budget_a = await budget_svc.create_for_user(
        USER_A.id,
        CreateBudgetInput(
            categoryId="11111111-1111-4111-8111-111111111111",
            amountCents=3000000,
            month="2026-09",
        ),
    )

    # User B listing budgets for 2026-09 sees 0
    statuses_b = await budget_svc.list_statuses_for_user(USER_B.id, "2026-09")
    assert len(statuses_b) == 0

    # User B cannot update Alice's budget
    with pytest.raises(NotFoundException):
        await budget_svc.update_for_user(
            USER_B.id, budget_a.id, UpdateBudgetInput(amountCents=100)
        )

    # User B cannot delete Alice's budget
    with pytest.raises(NotFoundException):
        await budget_svc.delete_for_user(USER_B.id, budget_a.id)


@pytest.mark.asyncio
async def test_financial_goal_multi_tenancy(in_memory_services):
    goal_svc = in_memory_services["goal"]

    # User A creates goal
    goal_a = await goal_svc.create_for_user(
        USER_A.id,
        CreateGoalInput(
            name="Alice Emergency Fund",
            targetAmountCents=10000000,
            currentSavedCents=4200000,
            targetDate=date(2026, 12, 31),
        ),
    )

    # User B listing goals sees 0
    goals_b = await goal_svc.list_statuses_for_user(USER_B.id)
    assert len(goals_b) == 0

    # User B cannot read Alice's goal
    with pytest.raises(NotFoundException):
        await goal_svc.get_goal_for_user(USER_B.id, goal_a.id)

    # User B cannot update Alice's goal
    with pytest.raises(NotFoundException):
        await goal_svc.update_for_user(
            USER_B.id, goal_a.id, UpdateGoalInput(name="Bob Goal Stolen")
        )

    # User B cannot contribute to Alice's goal
    with pytest.raises(NotFoundException):
        await goal_svc.contribute_for_user(USER_B.id, goal_a.id, 50000)

    # User B cannot delete Alice's goal
    with pytest.raises(NotFoundException):
        await goal_svc.delete_for_user(USER_B.id, goal_a.id)

    # User B cannot fetch an Action Plan for Alice's goal
    with pytest.raises(NotFoundException):
        await goal_svc.get_action_plan_for_goal(USER_B.id, goal_a.id)


@pytest.mark.asyncio
async def test_analytics_and_ai_tools_user_isolation(in_memory_services):
    tx_svc = in_memory_services["tx"]
    analytics_svc = in_memory_services["analytics"]

    # Alice has ₹1,00,000 income and ₹40,000 expenses
    await tx_svc.create_for_user(
        USER_A.id,
        CreateTransactionInput(
            type="income",
            amountCents=10000000,
            categoryId="33333333-3333-4333-8333-333333333333",
            description="Alice Salary",
            occurredOn=date(2026, 9, 1),
        ),
    )
    await tx_svc.create_for_user(
        USER_A.id,
        CreateTransactionInput(
            type="expense",
            amountCents=4000000,
            categoryId="11111111-1111-4111-8111-111111111111",
            description="Alice Groceries",
            occurredOn=date(2026, 9, 5),
        ),
    )

    # Bob's analytics summary must reflect 0
    bob_summary = await analytics_svc.get_financial_summary(USER_B.id, "2026-09")
    assert bob_summary.incomeCents == 0
    assert bob_summary.expenseCents == 0
    assert bob_summary.netSavingsCents == 0

    # Build ToolRegistry using in-memory services
    tool_services = ToolServices(
        transactions=tx_svc,
        categories=in_memory_services["cat"],
        budgets=in_memory_services["budget"],
        goals=in_memory_services["goal"],
        analytics=analytics_svc,
    )
    registry = ToolRegistry()
    register_financial_tools(registry, tool_services)

    # Bob calls get_my_transactions via AI tool: sees 0
    bob_txs = await registry.execute("get_my_transactions", {}, USER_B)
    assert len(bob_txs) == 0

    # Bob calls get_my_financial_summary via AI tool: sees 0
    bob_ai_summary = await registry.execute(
        "get_my_financial_summary", {"period": "2026-09"}, USER_B
    )
    assert bob_ai_summary.incomeCents == 0
    assert bob_ai_summary.expenseCents == 0
