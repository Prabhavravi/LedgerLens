"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";

const navItems = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Transactions", href: "/transactions" },
  { name: "Budgets", href: "/budgets" },
  { name: "Goals", href: "/goals" },
  { name: "AI Assistant", href: "/ai-assistant" },
];

export function AppNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <header className="mb-8 border-b border-slate-800 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white hover:opacity-90">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-black text-white shadow-sm">
              L
            </span>
            <span>LedgerLens</span>
          </Link>
          <span className="rounded bg-blue-950 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-400 border border-blue-800/50 uppercase">
            AI Finance
          </span>
        </div>

        {/* User & Logout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="max-w-[160px] truncate sm:max-w-[220px]">{userEmail}</span>
          </div>
          <LogoutButton />
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <nav aria-label="Primary navigation" className="mt-4 flex flex-wrap gap-1 border-t border-slate-800/60 pt-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
