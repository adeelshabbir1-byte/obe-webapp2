import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../lib/session";

// The marketing/landing page previously shown here has been moved aside
// (see landing-page-backup.tsx.txt, kept outside app/ so it's not a
// route) — the root URL now goes straight to sign-in instead of
// requiring an extra click through a landing page first.
export default async function Home() {
  const user = await getAuthenticatedUser();
  redirect(user ? "/dashboard" : "/login");
}
