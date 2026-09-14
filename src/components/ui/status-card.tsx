import type { ReactNode } from "react";
export function StatusCard({ children }: { children: ReactNode }) { return <section className="mt-6 rounded-lg border border-slate-700 bg-slate-900 p-5 text-slate-300">{children}</section>; }
