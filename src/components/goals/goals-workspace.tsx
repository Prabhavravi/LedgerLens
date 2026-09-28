"use client";

import { useEffect, useMemo, useState } from "react";
import type { GoalActionPlan, GoalStatus } from "@/types/domain";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

import type { ApiFailure, ApiResult } from "@/types/api";

const money = (cents: number) =>
  `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function GoalsWorkspace() {
  const [goals, setGoals] = useState<GoalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentSaved, setCurrentSaved] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [description, setDescription] = useState("");
  const [formMessage, setFormMessage] = useState<string>();

  // Quick contribute modal state
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");

  // Action plan modal state
  const [activePlan, setActivePlan] = useState<GoalActionPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/backend-api/goals", { cache: "no-store" });
      const body = (await response.json()) as ApiResult<GoalStatus[]>;
      if (!body.ok) throw new Error(body.error?.message ?? "Unable to load goals.");
      setGoals(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load goals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const metrics = useMemo(() => {
    const totalGoals = goals.length;
    const totalTargetCents = goals.reduce((sum, g) => sum + g.goal.targetAmountCents, 0);
    const totalSavedCents = goals.reduce((sum, g) => sum + g.goal.currentSavedCents, 0);
    const overallProgress = totalTargetCents > 0
      ? Math.round((totalSavedCents / totalTargetCents) * 10000) / 100
      : 0;
    return { totalGoals, totalTargetCents, totalSavedCents, overallProgress };
  }, [goals]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMessage(undefined);
    const targetCents = Math.round(Number(targetAmount) * 100);
    const savedCents = currentSaved ? Math.round(Number(currentSaved) * 100) : 0;

    if (!name.trim()) return setFormMessage("Please enter a goal name.");
    if (!Number.isFinite(targetCents) || targetCents <= 0)
      return setFormMessage("Target amount must be greater than zero.");
    if (!targetDate) return setFormMessage("Please select a target deadline.");

    setBusy(true);
    try {
      const response = await fetch("/backend-api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          targetAmountCents: targetCents,
          currentSavedCents: savedCents,
          targetDate,
          description: description.trim() || undefined,
        }),
      });
      const body = (await response.json()) as ApiResult<unknown>;
      if (!body.ok) throw new Error(body.error?.message ?? "Failed to create goal.");

      setName("");
      setTargetAmount("");
      setCurrentSaved("");
      setTargetDate("");
      setDescription("");
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : "Failed to create goal.");
    } finally {
      setBusy(false);
    }
  }

  async function submitContribute(e: React.FormEvent) {
    e.preventDefault();
    if (!contributeGoalId) return;
    const amountCents = Math.round(Number(contributeAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;

    setBusy(true);
    try {
      const response = await fetch(`/backend-api/goals/${contributeGoalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      if (!response.ok) {
        const body = (await response.json()) as ApiFailure;
        throw new Error(body.error?.message ?? "Contribution failed.");
      }
      setContributeGoalId(null);
      setContributeAmount("");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to contribute funds.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGoal(goalId: string, goalName: string) {
    if (!window.confirm(`Are you sure you want to delete the goal "${goalName}"?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/backend-api/goals/${goalId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json()) as ApiFailure;
        throw new Error(body.error?.message ?? "Failed to delete goal.");
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete goal.");
    } finally {
      setBusy(false);
    }
  }

  async function openActionPlan(goalId: string) {
    setPlanLoading(true);
    try {
      const response = await fetch(`/backend-api/goals/${goalId}/plan`);
      const body = (await response.json()) as ApiResult<GoalActionPlan>;
      if (!body.ok) throw new Error(body.error?.message ?? "Failed to load action plan.");
      setActivePlan(body.data ?? null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load action plan.");
    } finally {
      setPlanLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Financial Goals & Action Plans</h1>
          <p className="mt-1 text-slate-300">
            Define savings targets and track deterministic monthly action plans.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500"
        >
          {showCreateForm ? "Close Form" : "+ New Financial Goal"}
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-slate-700 p-4">
          <p className="text-sm text-slate-300">Active Goals</p>
          <p className="mt-1 text-2xl font-semibold">{metrics.totalGoals}</p>
        </article>
        <article className="rounded-lg border border-slate-700 p-4">
          <p className="text-sm text-slate-300">Total Target</p>
          <p className="mt-1 text-2xl font-semibold">{money(metrics.totalTargetCents)}</p>
        </article>
        <article className="rounded-lg border border-slate-700 p-4">
          <p className="text-sm text-slate-300">Total Saved</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400">
            {money(metrics.totalSavedCents)}
          </p>
        </article>
        <article className="rounded-lg border border-slate-700 p-4">
          <p className="text-sm text-slate-300">Overall Progress</p>
          <p className="mt-1 text-2xl font-semibold">{metrics.overallProgress}%</p>
        </article>
      </div>

      {/* Create Goal Form */}
      {showCreateForm && (
        <form
          onSubmit={submitCreate}
          className="rounded-lg border border-slate-700 bg-slate-900/60 p-5 space-y-4"
        >
          <h2 className="text-lg font-semibold">Create a Financial Goal</h2>
          {formMessage && <p className="text-sm text-rose-400">{formMessage}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">
                Goal Name *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Save ₹1,00,000 or Buy a laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">
                Target Amount (₹) *
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="1"
                placeholder="100000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">
                Currently Saved (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={currentSaved}
                onChange={(e) => setCurrentSaved(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase text-slate-400">
                Target Deadline *
              </label>
              <input
                required
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium uppercase text-slate-400">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. For MacBook M3 purchase by year end"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save Financial Goal"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Goal Cards List */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded border border-red-500 p-4 text-red-200">{error}</p>
      ) : goals.length === 0 ? (
        <EmptyState
          title="No financial goals created yet"
          description="Define a savings target to unlock your monthly action plan and AI-grounded spending recommendations."
          action={
            <button
              onClick={() => setShowCreateForm(true)}
              className="rounded bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              + Create Your First Goal
            </button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {goals.map((item) => {
            const { goal, remainingAmountCents, percentageCompleted, remainingMonths, requiredMonthlySavingsCents, status } = item;
            const progress = Math.min(100, Math.max(0, percentageCompleted));

            const badgeColor =
              status === "achieved"
                ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                : status === "overdue"
                ? "bg-rose-900/60 text-rose-300 border-rose-700"
                : status === "on_track"
                ? "bg-blue-900/60 text-blue-300 border-blue-700"
                : "bg-amber-900/60 text-amber-300 border-amber-700";

            const statusLabel =
              status === "achieved"
                ? "Achieved"
                : status === "overdue"
                ? "Overdue"
                : status === "on_track"
                ? "On Track"
                : "Behind Pace";

            return (
              <article
                key={goal.id}
                className="flex flex-col justify-between rounded-lg border border-slate-700 bg-slate-900/40 p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{goal.name}</h2>
                      {goal.description && (
                        <p className="mt-0.5 text-xs text-slate-400">{goal.description}</p>
                      )}
                    </div>
                    <span
                      className={`rounded border px-2.5 py-0.5 text-xs font-semibold uppercase ${badgeColor}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-200">
                        {money(goal.currentSavedCents)}
                      </span>
                      <span className="text-slate-400">
                        Target: {money(goal.targetAmountCents)} ({progress}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded bg-slate-800">
                      <div
                        className={`h-full transition-all ${
                          status === "achieved" ? "bg-emerald-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Key Fact Indicators */}
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-slate-800/60 p-2">
                      <dt className="text-slate-400">Remaining Amount</dt>
                      <dd className="mt-0.5 text-sm font-medium">{money(remainingAmountCents)}</dd>
                    </div>
                    <div className="rounded bg-slate-800/60 p-2">
                      <dt className="text-slate-400">Deadline</dt>
                      <dd className="mt-0.5 text-sm font-medium">
                        {goal.targetDate} ({remainingMonths} mo)
                      </dd>
                    </div>
                    <div className="col-span-2 rounded bg-slate-800/60 p-2">
                      <dt className="text-slate-400">Required Monthly Savings</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-blue-300">
                        {money(requiredMonthlySavingsCents)} / month
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => void openActionPlan(goal.id)}
                      disabled={planLoading}
                      className="rounded bg-indigo-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      Monthly Action Plan
                    </button>
                    <button
                      onClick={() => setContributeGoalId(goal.id)}
                      className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                    >
                      + Add Funds
                    </button>
                  </div>
                  <button
                    onClick={() => void deleteGoal(goal.id, goal.name)}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Contribute Modal */}
      {contributeGoalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Record Contribution</h3>
            <p className="mt-1 text-sm text-slate-400">
              Add funds saved towards this goal.
            </p>
            <form onSubmit={submitContribute} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase text-slate-400">
                  Amount to Add (₹)
                </label>
                <input
                  required
                  autoFocus
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 5000"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setContributeGoalId(null);
                    setContributeAmount("");
                  }}
                  className="rounded bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium hover:bg-blue-500"
                >
                  Confirm Contribution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monthly Action Plan Modal */}
      {activePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Deterministic Action Plan
                </span>
                <h3 className="text-xl font-bold">{activePlan.goal.name}</h3>
                <p className="text-xs text-slate-400">
                  Target: {activePlan.goal.targetDate}
                </p>
              </div>
              <button
                onClick={() => setActivePlan(null)}
                className="rounded bg-slate-800 px-2.5 py-1 text-sm hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Calculated Facts Grid */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Calculated Facts (Verified Math)
              </h4>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-slate-400">Goal Remaining</p>
                  <p className="text-base font-semibold text-slate-100">
                    {money(activePlan.calculatedFacts.remainingAmountCents)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Remaining Period</p>
                  <p className="text-base font-semibold text-slate-100">
                    {activePlan.calculatedFacts.remainingMonths} month(s)
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Required Avg Monthly Saving</p>
                  <p className="text-base font-semibold text-blue-400">
                    {money(activePlan.calculatedFacts.requiredMonthlySavingsCents)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Current Monthly Net Savings</p>
                  <p className="text-base font-semibold text-slate-100">
                    {money(activePlan.calculatedFacts.currentMonthlyNetSavingsCents)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Monthly Savings Gap</p>
                  <p className="text-base font-semibold text-amber-400">
                    {money(activePlan.calculatedFacts.savingsGapCents)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Feasibility Pace</p>
                  <p className="text-base font-semibold text-emerald-400 capitalize">
                    {activePlan.calculatedFacts.status.replace("_", " ")}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-300 border-t border-slate-800/80 pt-2">
                {activePlan.feasibilityAnalysis.summary}
              </p>
            </div>

            {/* AI Spending Adjustments Opportunities */}
            <div className="rounded-lg border border-indigo-900/40 bg-indigo-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Realistic Spending Adjustments (AI Grounded in Real Data)
                </h4>
                <span className="text-[10px] rounded bg-indigo-900/60 px-2 py-0.5 text-indigo-300">
                  Illustrative Suggestions
                </span>
              </div>
              {activePlan.spendingAdjustmentOpportunities.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No adjustable discretionary expenses found in recent transactions.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {activePlan.spendingAdjustmentOpportunities.map((opp) => (
                    <div
                      key={opp.categoryId}
                      className="rounded border border-indigo-900/40 bg-slate-900/60 p-3 text-xs"
                    >
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-200">{opp.categoryName}</span>
                        <span className="text-emerald-300">
                          + {money(opp.potentialMonthlySavingsCents)}/mo savings
                        </span>
                      </div>
                      <p className="mt-1 text-slate-400">{opp.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Methodology & Disclaimer */}
            <p className="text-[11px] text-slate-500 italic">
              {activePlan.disclaimer}
            </p>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActivePlan(null)}
                className="rounded bg-slate-800 px-4 py-2 text-xs font-medium hover:bg-slate-700"
              >
                Close Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
