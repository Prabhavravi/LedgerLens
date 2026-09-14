"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BudgetStatus, Category } from "@/types/domain";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type ApiResult<T> = { ok: boolean; data?: T; error?: { message: string } };

const currentMonth = new Date().toISOString().slice(0, 7);

const money = (cents: number) =>
  `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function BudgetsWorkspace() {
  const [month, setMonth] = useState(currentMonth);
  const [statuses, setStatuses] = useState<BudgetStatus[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<string>();
  const [message, setMessage] = useState<{ text: string; isError?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories]
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [budgetResponse, categoryResponse] = await Promise.all([
        fetch(`/backend-api/budgets?month=${month}`, { cache: "no-store" }),
        fetch("/backend-api/categories", { cache: "no-store" }),
      ]);
      const budgets = (await budgetResponse.json()) as ApiResult<BudgetStatus[]>;
      const categoryList = (await categoryResponse.json()) as ApiResult<Category[]>;

      if (budgetResponse.ok) setStatuses(budgets.data ?? []);
      else setMessage({ text: budgets.error?.message ?? "Failed to load budgets", isError: true });

      if (categoryResponse.ok) setCategories(categoryList.data ?? []);
      else setMessage({ text: categoryList.error?.message ?? "Failed to load categories", isError: true });
    } catch {
      setMessage({ text: "Unable to load budgets.", isError: true });
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return setMessage({ text: "Enter a budget amount greater than zero.", isError: true });
    }

    setBusy(true);
    setMessage(undefined);

    try {
      const response = await fetch(editing ? `/backend-api/budgets/${editing}` : "/backend-api/budgets", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { amountCents } : { categoryId, month, amountCents }),
      });

      const body = (await response.json()) as ApiResult<unknown>;
      if (!response.ok) {
        setMessage({ text: body?.error?.message ?? "Unable to save budget.", isError: true });
      } else {
        setMessage({ text: editing ? "Budget updated successfully." : "Budget added successfully." });
        setAmount("");
        setCategoryId("");
        setEditing(undefined);
        await load();
      }
    } catch {
      setMessage({ text: "Network error saving budget.", isError: true });
    } finally {
      setBusy(false);
    }
  }

  function edit(status: BudgetStatus) {
    setEditing(status.budget.id);
    setAmount((status.budget.amountCents / 100).toFixed(2));
    setCategoryId(status.category.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this budget? Category spending will no longer be capped.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/backend-api/budgets/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json()) as ApiResult<never>;
        setMessage({ text: body.error?.message ?? "Unable to delete budget.", isError: true });
      } else {
        setMessage({ text: "Budget deleted." });
        await load();
      }
    } catch {
      setMessage({ text: "Network error deleting budget.", isError: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Budgets</h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor and guard category spending for the selected calendar period.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300">
          <label htmlFor="budget-period" className="font-medium text-slate-400">
            Period:
          </label>
          <input
            id="budget-period"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Budget Creation / Edit Form */}
      <form
        onSubmit={submit}
        className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            {editing ? "Update Budget Cap" : "Add Monthly Category Budget"}
          </h2>
          {editing && (
            <span className="rounded bg-blue-950 px-2 py-0.5 text-[10px] text-blue-300 border border-blue-800">
              Editing mode
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">
              Expense Category *
            </label>
            <select
              required
              disabled={Boolean(editing)}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-60"
            >
              <option value="">Select expense category</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">
              Budget Cap Amount (₹) *
            </label>
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              placeholder="e.g. 15000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              disabled={busy}
              type="submit"
              className="rounded bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {editing ? "Save Budget" : "Add Budget"}
            </button>
            {editing && (
              <button
                type="button"
                className="rounded bg-slate-800 px-3.5 py-2.5 text-xs text-slate-300 hover:bg-slate-700"
                onClick={() => {
                  setEditing(undefined);
                  setAmount("");
                  setCategoryId("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      {message && (
        <div
          className={`rounded-lg p-3 text-xs ${
            message.isError
              ? "border border-rose-500/50 bg-rose-950/30 text-rose-300"
              : "border border-emerald-500/50 bg-emerald-950/30 text-emerald-300"
          }`}
          role={message.isError ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}

      {/* Budget Cards List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : statuses.length === 0 ? (
        <EmptyState
          title={`No budgets set for ${month}`}
          description="Set spending caps on your expense categories to prevent overspending and receive proactive alerts."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {statuses.map((status) => {
            const progress = Math.min(status.percentageUsed, 100);
            const isExceeded = status.exceeded;
            const isNearLimit = status.percentageUsed >= 80 && !isExceeded;

            const cardBorder = isExceeded
              ? "border-rose-500/60 bg-rose-950/15"
              : isNearLimit
              ? "border-amber-500/60 bg-amber-950/15"
              : "border-slate-800 bg-slate-900/50";

            return (
              <article
                key={status.budget.id}
                className={`rounded-lg border p-5 space-y-3.5 transition-all ${cardBorder}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-base text-slate-100">
                      {status.category.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Period: {status.budget.month}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      isExceeded
                        ? "bg-rose-900/60 text-rose-300 border-rose-700/60"
                        : isNearLimit
                        ? "bg-amber-900/60 text-amber-300 border-amber-700/60"
                        : "bg-blue-900/60 text-blue-300 border-blue-700/60"
                    }`}
                  >
                    {isExceeded
                      ? `${status.percentageUsed}% Exceeded`
                      : `${status.percentageUsed}% Used`}
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-slate-300">
                      Spent: {money(status.spentCents)}
                    </span>
                    <span className="text-slate-400">
                      Cap: {money(status.budget.amountCents)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                    <div
                      className={`h-full transition-all ${
                        isExceeded ? "bg-rose-500" : isNearLimit ? "bg-amber-500" : "bg-blue-500"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                  <span
                    className={
                      isExceeded
                        ? "font-semibold text-rose-400"
                        : isNearLimit
                        ? "font-medium text-amber-300"
                        : "text-slate-400"
                    }
                  >
                    {isExceeded
                      ? `${money(Math.abs(status.remainingCents))} over cap`
                      : `${money(status.remainingCents)} remaining`}
                  </span>

                  <div className="space-x-3">
                    <button
                      onClick={() => edit(status)}
                      className="text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void remove(status.budget.id)}
                      className="text-rose-400 hover:text-rose-300 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
