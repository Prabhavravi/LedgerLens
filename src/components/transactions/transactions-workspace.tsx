"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Category, Transaction, TransactionType } from "@/types/domain";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type ApiResult<T> = { ok: boolean; data?: T; error?: { message: string } };

const today = new Date().toISOString().slice(0, 10);
const blank = { type: "expense" as TransactionType, categoryId: "", amount: "", description: "", occurredOn: today };

const money = (cents: number) =>
  `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function TransactionsWorkspace() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState<string>();
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"" | TransactionType>("");
  const [sort, setSort] = useState("newest");
  const [message, setMessage] = useState<{ text: string; isError?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const usableCategories = useMemo(
    () => categories.filter((cat) => cat.type === form.type),
    [categories, form.type]
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const load = useCallback(async () => {
    setBusy(true);
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set("query", query.trim());
    if (filterType) params.set("type", filterType);

    try {
      const [txRes, catRes] = await Promise.all([
        fetch(`/backend-api/transactions?${params}`, { cache: "no-store" }),
        fetch("/backend-api/categories", { cache: "no-store" }),
      ]);
      const txBody = (await txRes.json()) as ApiResult<Transaction[]>;
      const catBody = (await catRes.json()) as ApiResult<Category[]>;

      if (txRes.ok) setTransactions(txBody.data ?? []);
      else setMessage({ text: txBody.error?.message ?? "Failed to load transactions", isError: true });

      if (catRes.ok) setCategories(catBody.data ?? []);
      else setMessage({ text: catBody.error?.message ?? "Failed to load categories", isError: true });
    } catch {
      setMessage({ text: "Unable to load transactions.", isError: true });
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [query, filterType, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  function update(name: keyof typeof blank, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "type" ? { categoryId: "" } : {}),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return setMessage({ text: "Enter an amount greater than zero.", isError: true });
    }

    setBusy(true);
    setMessage(undefined);
    const endpoint = editId ? `/backend-api/transactions/${editId}` : "/backend-api/transactions";

    try {
      const response = await fetch(endpoint, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: form.categoryId,
          type: form.type,
          amountCents,
          description: form.description.trim(),
          occurredOn: form.occurredOn,
        }),
      });
      const body = (await response.json()) as ApiResult<Transaction>;
      if (!response.ok) {
        setMessage({ text: body.error?.message ?? "Unable to save transaction.", isError: true });
      } else {
        setForm(blank);
        setEditId(undefined);
        setMessage({ text: editId ? "Transaction updated successfully." : "Transaction added successfully." });
        await load();
      }
    } catch {
      setMessage({ text: "Network error saving transaction.", isError: true });
    } finally {
      setBusy(false);
    }
  }

  function edit(transaction: Transaction) {
    setEditId(transaction.id);
    setForm({
      type: transaction.type,
      categoryId: transaction.categoryId,
      amount: (transaction.amountCents / 100).toFixed(2),
      description: transaction.description,
      occurredOn: transaction.occurredOn,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this transaction? This will update your analytics and budgets.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/backend-api/transactions/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json()) as ApiResult<never>;
        setMessage({ text: body.error?.message ?? "Unable to delete transaction.", isError: true });
      } else {
        setMessage({ text: "Transaction deleted." });
        await load();
      }
    } catch {
      setMessage({ text: "Network error deleting transaction.", isError: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <p className="mt-1 text-sm text-slate-400">
          Record, review, and organize your income and expenses with integer precision.
        </p>
      </div>

      {/* Transaction Entry Form */}
      <form
        onSubmit={submit}
        className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            {editId ? "Edit Transaction" : "New Transaction"}
          </h2>
          {editId && (
            <span className="rounded bg-blue-950 px-2 py-0.5 text-[10px] text-blue-300 border border-blue-800">
              Editing mode
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="expense">Expense (-)</option>
              <option value="income">Income (+)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">Category *</label>
            <select
              required
              value={form.categoryId}
              onChange={(e) => update("categoryId", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select category</option>
              {usableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">Amount (₹) *</label>
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              placeholder="e.g. 750"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">Date *</label>
            <input
              required
              type="date"
              value={form.occurredOn}
              onChange={(e) => update("occurredOn", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium uppercase text-slate-400 mb-1">Description *</label>
            <input
              required
              maxLength={255}
              placeholder="e.g. Weekly grocery run"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            disabled={busy}
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {editId ? "Update Transaction" : "Record Transaction"}
          </button>
          {editId && (
            <button
              type="button"
              className="rounded bg-slate-800 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-700"
              onClick={() => {
                setEditId(undefined);
                setForm(blank);
              }}
            >
              Cancel Edit
            </button>
          )}
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

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search by description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[200px] flex-1 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "" | TransactionType)}
          className="rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="expense">Expenses Only</option>
          <option value="income">Income Only</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="amount_desc">Highest Amount</option>
          <option value="amount_asc">Lowest Amount</option>
        </select>
      </div>

      {/* Transactions Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description={
            query || filterType
              ? "No transactions match your current search or filter."
              : "Start recording your income and expenses to unlock your financial overview."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 font-semibold uppercase tracking-wider text-slate-400">
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Description</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5 text-right">Amount</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transactions.map((tx) => {
                const categoryName = categoryMap.get(tx.categoryId) ?? "Uncategorized";
                return (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400">{tx.occurredOn}</td>
                    <td className="p-3.5 font-medium text-slate-200 max-w-[220px] truncate">
                      {tx.description}
                    </td>
                    <td className="p-3.5 text-slate-400">{categoryName}</td>
                    <td className="p-3.5">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          tx.type === "income"
                            ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                            : "bg-rose-900/50 text-rose-300 border border-rose-700/50"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td
                      className={`p-3.5 text-right font-mono font-semibold ${
                        tx.type === "income" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "-"} {money(tx.amountCents)}
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => edit(tx)}
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void remove(tx.id)}
                        className="text-rose-400 hover:text-rose-300 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
