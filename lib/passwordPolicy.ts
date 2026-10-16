// The rule every new staff password follows — the same as Change Password (app/api/auth/change-password/route.ts):
// at least 8 characters, not one of the shared defaults, and not the login name.

const WEAK = ["12345678", "123456789", "password", "password1", "qwertyui"];

/** null when the password is acceptable, otherwise the reason to show. */
export function passwordProblem(password: unknown, username: string | null | undefined): string | null {
  const p = typeof password === "string" ? password : "";
  if (p.length < 8) return "The password must be at least 8 characters.";
  if (p.length > 200) return "That password is too long.";
  if (WEAK.includes(p.toLowerCase()) || p.toLowerCase() === String(username || "").toLowerCase()) return "That password is too easy to guess — choose something else.";
  return null;
}
