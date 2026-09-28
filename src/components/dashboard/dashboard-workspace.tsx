"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FinancialAnalytics, FinancialInsight, GoalStatus } from "@/types/domain";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

import type { ApiResult } from "@/types/api";

const money = (cents: number) =>
  `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const currentMonthStr = new Date().toISOString().slice(0, 7);

const quickAiPrompts = [
  { label: "Check goal feasibility", query: "Can I still reach my financial goals?" },
  { label: "Find savings opportunities", query: "What spending categories give me the biggest opportunity to save?" },
  { label: "Review budget health", query: "Are any of my budgets approaching or exceeding their limit?" },
  { label: "Monthly financial health", query: "How am I doing financially this month?" },
];

export function DashboardWorkspace() {
  const [data, setData] = useState<FinancialAnalytics>();
  const [insights, setInsights] = useState<FinancialInsight[]>([]);
  const [goals, setGoals] = useState<GoalStatus[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    Promise.all([
      fetch(`/backend-api/analytics/dashboard?month=${currentMonthStr}`, { cache: "no-store" }),
      fetch(`/backend-api/insights?month=${currentMonthStr}`, { cache: "no-store" }),
      fetch("/backend-api/goals", { cache: "no-store" }),
    ])
      .then(async ([analyticsRes, insightRes, goalRes]) => {
        const dashboard = (await analyticsRes.json()) as ApiResult<FinancialAnalytics>;
        const insightBody = (await insightRes.json()) as ApiResult<FinancialInsight[]>;
        const goalBody = (await goalRes.json()) as ApiResult<GoalStatus[]>;

        if (!dashboard.ok) setError(dashboard.error?.message ?? "Unable to load analytics.");
        else setData(dashboard.data);

        if (insightBody.ok) setInsights(insightBody.data ?? []);
        if (goalBody.ok) setGoals(goalBody.data ?? []);
      })
      .catch(() => setError("Unable to load analytics data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/20 p-5 text-rose-300">
          <p className="font-semibold">Unable to load dashboard</p>
          <p className="mt-1 text-sm">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700">
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { summary, categoryBreakdown, spendingTrend, budgetOverview, largestTransactions } = data;
  const maximumCategory = Math.max(...categoryBreakdown.map((item) => item.amountCents), 1);

  return (
    <section className="space-y-8">
      {/* Header & Quick Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Financial Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Verified financial overview for period <span className="font-mono text-slate-200">{summary.period}</span>.
          </p>
        </div>
        <Link
          href="/ai-assistant"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
        >
          <span>Ask AI Assistant</span>
          <span>→</span>
        </Link>
      </div>

      {/* Contextual AI Quick Prompts Bar */}
      <div className="rounded-lg border border-blue-900/40 bg-blue-950/20 p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
            Ask AI About Your Finances
          </span>
          <span className="text-[11px] text-slate-400">Grounded in your real transactions</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickAiPrompts.map((p, idx) => (
            <Link
              key={idx}
              href={`/ai-assistant?prompt=${encodeURIComponent(p.query)}`}
              className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:border-blue-500/50 hover:bg-blue-900/30 hover:text-blue-200 transition-colors"
            >
              💬 {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Primary KPI Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Income</p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-400">{money(summary.incomeCents)}</p>
          <p className="mt-1 text-xs text-slate-500">Total recorded this month</p>
        </article>

        <article className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expenses</p>
          <p className="mt-1.5 text-2xl font-bold text-rose-400">{money(summary.expenseCents)}</p>
          <p className="mt-1 text-xs text-slate-500">Outflows this month</p>
        </article>

        <article className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Net Savings</p>
          <p className={`mt-1.5 text-2xl font-bold ${summary.netSavingsCents >= 0 ? "text-blue-400" : "text-amber-400"}`}>
            {money(summary.netSavingsCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Income minus expenses</p>
        </article>

        <article className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Savings Rate</p>
          <p className="mt-1.5 text-2xl font-bold text-indigo-400">
            {summary.savingsRate === null ? "—" : `${summary.savingsRate}%`}
          </p>
          <p className="mt-1 text-xs text-slate-500">Share of income saved</p>
        </article>
      </div>

      {/* Spending Breakdown & Key Indicators */}
      {summary.expenseCents === 0 ? (
        <EmptyState
          title="No transactions recorded this month"
          description="Add your first income or expense to populate your financial trends, category shares, and proactive alerts."
          action={
            <Link
              href="/transactions"
              className="rounded bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500"
            >
              + Add Transaction
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Category Spending Breakdown */}
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Spending by Category</h2>
              <span className="text-xs text-slate-400">{categoryBreakdown.length} active categories</span>
            </div>
            <div className="space-y-3.5">
              {categoryBreakdown.map((item) => (
                <div key={item.categoryId} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-200">{item.categoryName}</span>
                    <span className="text-slate-400">
                      {money(item.amountCents)} · {item.percentageOfExpenses}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${(item.amountCents / maximumCategory) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Key Indicators & Largest Expenses */}
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 flex flex-col justify-between">
            <div>
              <h2 className="font-semibold text-base mb-4">Spending Trajectory</h2>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded bg-slate-800/60 p-3">
                  <dt className="text-slate-400">Daily Average</dt>
                  <dd className="mt-1 text-sm font-semibold">{money(summary.averageDailyExpenseCents)}</dd>
                </div>
                <div className="rounded bg-slate-800/60 p-3">
                  <dt className="text-slate-400">Month-over-Month</dt>
                  <dd className={`mt-1 text-sm font-semibold ${
                    spendingTrend.changePercent === null
                      ? "text-slate-300"
                      : spendingTrend.changePercent > 0
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}>
                    {spendingTrend.changePercent === null
                      ? "Baseline"
                      : `${spendingTrend.changePercent > 0 ? "+" : ""}${spendingTrend.changePercent}%`}
                  </dd>
                </div>
              </dl>

              <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-400 mt-5 mb-2">
                Top Expenses This Month
              </h3>
              {largestTransactions.length === 0 ? (
                <p className="text-xs text-slate-500">No expenses recorded.</p>
              ) : (
                <ul className="space-y-2 text-xs divide-y divide-slate-800/60">
                  {largestTransactions.map((item) => (
                    <li className="flex justify-between pt-1.5" key={item.id}>
                      <span className="truncate max-w-[200px] text-slate-300">{item.description}</span>
                      <span className="font-medium text-slate-100">{money(item.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Contextual AI Prompt for Trajectory */}
            <div className="mt-4 border-t border-slate-800 pt-3">
              <Link
                href={`/ai-assistant?prompt=${encodeURIComponent("Explain my spending trajectory and month-over-month trend.")}`}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
              >
                <span>🤖 Explain this trend with AI</span>
                <span>→</span>
              </Link>
            </div>
          </section>
        </div>
      )}

      {/* Proactive Insights Section with Contextual AI */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Proactive Financial Insights</h2>
            <p className="text-xs text-slate-400 mt-0.5">Evidence-backed signals computed by deterministic rules.</p>
          </div>
          <span className="text-xs text-slate-500">{insights.length} active signal(s)</span>
        </div>

        {insights.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No spending surges or budget overruns detected for this period.
          </p>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2">
            {insights.map((insight) => {
              const borderClass =
                insight.severity === "critical"
                  ? "border-rose-500/60 bg-rose-950/15"
                  : insight.severity === "warning"
                  ? "border-amber-500/60 bg-amber-950/15"
                  : "border-slate-800 bg-slate-900/60";

              // Build contextual prompt based on insight type
              const contextualPrompt =
                insight.type === "category_surge"
                  ? `Why did my ${insight.category} spending increase by ${insight.percentageChange}% and what can I do about it?`
                  : insight.type === "budget_overrun"
                  ? `My ${insight.category} budget has exceeded its limit. How can I adjust my spending?`
                  : insight.type === "budget_approaching"
                  ? `My ${insight.category} budget is nearly used up. What is my remaining safe spending?`
                  : "Explain the month-over-month change in my spending.";

              return (
                <article
                  key={insight.id}
                  className={`rounded-lg border p-4 flex flex-col justify-between ${borderClass}`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-100">
                        {insight.category ?? "Overall Spending"}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 border ${
                          insight.severity === "critical"
                            ? "bg-rose-900/60 text-rose-300 border-rose-700/60"
                            : insight.severity === "warning"
                            ? "bg-amber-900/60 text-amber-300 border-amber-700/60"
                            : "bg-blue-900/60 text-blue-300 border-blue-700/60"
                        }`}
                      >
                        {insight.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-200">
                      {insight.explanation}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      {insight.recommendation}
                    </p>
                  </div>

                  {/* Contextual AI Action Button */}
                  <div className="mt-4 border-t border-slate-800/80 pt-2.5 flex justify-end">
                    <Link
                      href={`/ai-assistant?prompt=${encodeURIComponent(contextualPrompt)}`}
                      className="rounded bg-blue-600/20 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
                    >
                      Ask AI: Why did this happen? →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Financial Goals Overview */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Savings Goals & Action Plans</h2>
            <p className="text-xs text-slate-400 mt-0.5">Track progress toward your targets.</p>
          </div>
          <Link href="/goals" className="text-xs font-semibold text-blue-400 hover:underline">
            Manage all goals →
          </Link>
        </div>

        {goals.length === 0 ? (
          <EmptyState
            title="No financial goals created"
            description="Create a savings target to receive deterministic monthly savings calculations."
            action={
              <Link
                href="/goals"
                className="rounded bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                + Create Goal
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2">
            {goals.slice(0, 4).map((item) => (
              <div
                className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2.5"
                key={item.goal.id}
              >
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-slate-100">{item.goal.name}</span>
                  <span className="text-xs font-mono text-blue-300">{item.percentageCompleted}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-full ${item.status === "achieved" ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, item.percentageCompleted)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Saved: {money(item.goal.currentSavedCents)}</span>
                  <span>Target: {money(item.goal.targetAmountCents)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
                  <span className="text-blue-300 font-medium">
                    Required: {money(item.requiredMonthlySavingsCents)}/mo
                  </span>
                  <Link
                    href={`/ai-assistant?prompt=${encodeURIComponent(`Can I still reach my ${item.goal.name} goal?`)}`}
                    className="text-[11px] text-slate-400 hover:text-blue-300"
                  >
                    Ask AI feasibility →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Budget Overview Section */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Monthly Budgets</h2>
            <p className="text-xs text-slate-400 mt-0.5">Category caps for {summary.period}.</p>
          </div>
          <Link href="/budgets" className="text-xs font-semibold text-blue-400 hover:underline">
            Manage budgets →
          </Link>
        </div>

        {budgetOverview.length === 0 ? (
          <EmptyState
            title="No budgets set for this month"
            description="Set spending limits by category to guard against overspending."
            action={
              <Link
                href="/budgets"
                className="rounded bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                + Set Budget
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2">
            {budgetOverview.map((item) => (
              <div
                className={`rounded-lg border p-4 ${
                  item.exceeded ? "border-rose-500/50 bg-rose-950/20" : "border-slate-800 bg-slate-900/60"
                }`}
                key={item.budget.id}
              >
                <div className="flex justify-between items-center text-sm font-medium">
                  <span>{item.category.name}</span>
                  <span className={item.exceeded ? "text-rose-400 font-semibold" : "text-slate-300"}>
                    {item.percentageUsed}% {item.exceeded ? "exceeded" : "used"}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-full ${item.exceeded ? "bg-rose-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, item.percentageUsed)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {money(item.spentCents)} spent of {money(item.budget.amountCents)} cap
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
