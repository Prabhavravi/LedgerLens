"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ActionTool =
  | "create_my_transaction"
  | "update_my_transaction"
  | "create_or_update_my_budget"
  | "create_my_financial_goal"
  | "update_my_financial_goal";

type Action = {
  tool: ActionTool;
  input: Record<string, unknown>;
  title: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
  result?: string;
};

const suggestionChips = [
  "How am I doing financially this month?",
  "Can I still reach my financial goals?",
  "What spending categories give me the biggest opportunity to save?",
  "I spent ₹850 on dinner yesterday",
];

function AssistantInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPromptProcessed = useRef(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I am your LedgerLens financial assistant. Ask me about your spending, trends, budgets, or savings goals. I query your verified records using allow-listed tools and ask for confirmation before changing any data.",
    },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const executeMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    setLoading(true);
    setError(undefined);

    const nextMessages: Message[] = [...messagesRef.current, { role: "user", content: content.trim() }];
    setMessages(nextMessages);
    setText("");

    try {
      const response = await fetch("/backend-api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: msg }) => ({ role, content: msg })),
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Assistant request failed.");

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: body.data.message,
          actions: body.data.pendingActions,
        },
      ]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Assistant request failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle deep-linked prompt on mount
  useEffect(() => {
    const promptParam = searchParams.get("prompt");
    if (promptParam && !initialPromptProcessed.current) {
      initialPromptProcessed.current = true;
      void executeMessage(promptParam);
    }
  }, [searchParams, executeMessage]);

  async function confirm(action: Action) {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/backend-api/ai/assistant/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: action.tool, input: action.input }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Action failed.");

      setMessages((current) => [
        ...current.map((message) => ({ ...message, actions: message.actions?.filter((candidate) => candidate !== action) })),
        {
          role: "assistant",
          content: "✓ Action executed successfully",
          result: body.data.message,
        },
      ]);
      // Revalidate server-rendered financial summaries before the user returns to the dashboard.
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">AI Financial Assistant</h1>
        <p className="mt-1 text-slate-300">
          Grounded in your verified financial records. Proposed changes always require your explicit confirmation.
        </p>
      </div>

      {/* Suggestion Chips */}
      <div className="flex flex-wrap gap-2">
        {suggestionChips.map((chip, i) => (
          <button
            key={i}
            onClick={() => void executeMessage(chip)}
            disabled={loading}
            className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300 hover:border-blue-500/50 hover:bg-blue-950/40 hover:text-blue-200 transition-colors disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Messages Thread */}
      <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-950/40 p-4 sm:p-5 min-h-[360px]">
        {messages.map((message, index) => (
          <article
            key={index}
            className={`rounded-lg p-4 transition-all ${
              message.role === "user"
                ? "bg-blue-950/60 border border-blue-800/40 ml-6"
                : "bg-slate-900/80 border border-slate-800 mr-6"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  message.role === "user" ? "bg-blue-400" : "bg-emerald-400"
                }`}
              />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {message.role === "user" ? "You" : "LedgerLens Assistant"}
              </p>
            </div>
            <div className="mt-2 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
              {message.content}
            </div>

            {/* Pending Action Confirmation Card */}
            {message.actions && message.actions.length > 0 && (
              <div className="mt-4 space-y-3">
                {message.actions.map((action, actionIndex) => (
                  <div
                    key={actionIndex}
                    className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-amber-900/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 border border-amber-700/50">
                        AI Action — Confirmation Required
                      </span>
                      <span className="text-xs text-slate-400">{action.tool}</span>
                    </div>
                    <p className="mt-2 font-medium text-amber-200">{action.title}</p>
                    <pre className="mt-2 overflow-x-auto rounded bg-slate-950/70 p-2.5 text-xs text-slate-300 font-mono">
                      {JSON.stringify(action.input, null, 2)}
                    </pre>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void confirm(action)}
                        className="rounded bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                      >
                        Confirm Action
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          setMessages((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, actions: [] } : item
                            )
                          )
                        }
                        className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Success result message */}
            {message.result && (
              <div className="mt-3 rounded border border-emerald-800/60 bg-emerald-950/30 p-2.5 text-xs text-emerald-300">
                {message.result}
              </div>
            )}
          </article>
        ))}

        {loading && (
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-300 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
            Querying verified financial tools and analyzing data…
          </div>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-500/50 bg-red-950/30 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void executeMessage(text);
        }}
        className="flex gap-2"
      >
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question or describe an action (e.g. 'Can I reach my laptop goal?')"
          disabled={loading}
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          disabled={loading || !text.trim()}
        >
          Send
        </button>
      </form>
    </section>
  );
}

export function FinancialActionAssistant() {
  return (
    <Suspense fallback={<p className="text-slate-400" role="status">Loading assistant…</p>}>
      <AssistantInner />
    </Suspense>
  );
}
