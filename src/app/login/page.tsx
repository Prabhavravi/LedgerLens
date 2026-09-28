import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() { return <main className="mx-auto max-w-md p-10"><h1 className="text-2xl font-bold">Log in</h1><AuthForm mode="login" /><p className="mt-4 text-sm">New here? <Link className="underline" href="/signup">Create an account</Link></p></main>; }
