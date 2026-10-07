import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "./session";

// Shared sign-in checks for the Dean's pages.
export async function requireDean() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "DEAN") redirect("/dashboard");
  return user;
}
