import { redirect } from "next/navigation";
import { getBackendAuthenticatedUser } from "@/server/auth/backend-session";

export default async function HomePage() {
  // Authentication is owned by FastAPI. Do not import the legacy Next.js
  // database-backed auth service here: it would require backend secrets in
  // the frontend process.
  const user = await getBackendAuthenticatedUser();
  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
