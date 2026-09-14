"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function LogoutButton() { const [pending, setPending] = useState(false); const router = useRouter(); async function logout() { setPending(true); await fetch("/backend-api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); } return <button className="rounded bg-slate-800 px-3 py-2 text-sm" disabled={pending} onClick={logout}>{pending ? "Signing out…" : "Sign out"}</button>; }
