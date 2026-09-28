import { redirect } from "next/navigation";
import { getBackendAuthenticatedUser } from "@/lib/backend/session";

export default async function HomePage() {
  // FastAPI validates the session; Next.js only forwards the cookies.
  const user = await getBackendAuthenticatedUser();
  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
