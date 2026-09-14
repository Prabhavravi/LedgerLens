import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
export default function SignupPage() { return <main className="mx-auto max-w-md p-10"><h1 className="text-2xl font-bold">Create account</h1><AuthForm mode="signup" /><p className="mt-4 text-sm">Already registered? <Link className="underline" href="/login">Log in</Link></p></main>; }
