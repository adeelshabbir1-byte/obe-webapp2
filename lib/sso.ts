import crypto from "crypto";

// Single sign-on with Google Workspace or Microsoft 365 (OpenID Connect, authorization-code flow with PKCE).
// Turned on by setting the provider's client id and secret in the hosting environment. Only people who already
// have an OBEHUB account can sign in; the provider's verified email must match the account's email.
export type ProviderKey = "google" | "microsoft";
type P = { name: string; clientId?: string; secret?: string; auth: string; token: string; issuer: (iss: string) => boolean };

export function provider(key: string): P | null {
  if (key === "google") return { name: "Google", clientId: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", issuer: (i) => i === "https://accounts.google.com" || i === "accounts.google.com" };
  if (key === "microsoft") { const t = process.env.MICROSOFT_TENANT_ID || "organizations"; return { name: "Microsoft", clientId: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET, auth: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, issuer: (i) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(i) }; }
  return null;
}
export const enabledProviders = (): { key: ProviderKey; name: string }[] =>
  (["google", "microsoft"] as ProviderKey[]).map((k) => ({ key: k, p: provider(k)! })).filter((x) => x.p.clientId && x.p.secret).map((x) => ({ key: x.key, name: x.p.name }));

export const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = () => b64url(crypto.randomBytes(32));
export const challengeOf = (verifier: string) => b64url(crypto.createHash("sha256").update(verifier).digest());
export function decodeJwt(t: string): Record<string, unknown> | null {
  try { return JSON.parse(Buffer.from(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { return null; }
}
/** Optional allow-list of email domains (comma separated), e.g. "uni.edu.pk,students.uni.edu.pk". */
export function domainAllowed(email: string) {
  const list = (process.env.SSO_ALLOWED_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(email.split("@")[1]?.toLowerCase() || "");
}
export const appOrigin = (req: Request) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
