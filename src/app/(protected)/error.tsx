"use client";

export default function ProtectedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-lg border border-rose-500/40 bg-rose-950/20 p-6" role="alert">
      <h1 className="text-lg font-semibold text-rose-200">This section could not be loaded</h1>
      <p className="mt-2 text-sm text-rose-100/80">Your financial data was not changed. Please try again.</p>
      <button type="button" onClick={reset} className="mt-5 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Try again</button>
    </section>
  );
}
