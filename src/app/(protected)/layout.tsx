import { redirect } from "next/navigation";
import { getBackendAuthenticatedUser } from "@/lib/backend/session";
import { AppNav } from "@/components/layout/app-nav";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getBackendAuthenticatedUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4 sm:p-8">
      <a href="#main-content" className="sr-only rounded bg-blue-600 px-3 py-2 text-sm text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">
        Skip to main content
      </a>
      <AppNav userEmail={user.email} />
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
