import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../../../../lib/db";
import { createSession } from "../../../../../../lib/session";
import { writeAuditLog } from "../../../../../../lib/audit";
import { provider, decodeJwt, domainAllowed, appOrigin } from "../../../../../../lib/sso";

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const origin = appOrigin(req);
  const fail = (why: string) => { const r = NextResponse.redirect(`${origin}/login?sso=${why}`); r.cookies.delete("sso_flow"); return r; };
  const p = provider(params.provider);
  if (!p || !p.clientId || !p.secret) return fail("off");
  const q = new URL(req.url).searchParams;
  const [prov, state, nonce, verifier] = (cookies().get("sso_flow")?.value || "").split(".");
  if (!state || prov !== params.provider || q.get("state") !== state || !q.get("code")) return fail("expired");
  const tr = await fetch(p.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: p.clientId, client_secret: p.secret, code: q.get("code")!, grant_type: "authorization_code", redirect_uri: `${origin}/api/auth/sso/${params.provider}/callback`, code_verifier: verifier }) }).catch(() => null);
  const tok = tr && tr.ok ? ((await tr.json()) as { id_token?: string }) : null;
  // The ID token comes straight from the provider's token endpoint over TLS, so its claims are checked rather than its signature.
  const c = tok?.id_token ? decodeJwt(tok.id_token) : null;
  if (!c || c.aud !== p.clientId || c.nonce !== nonce || !p.issuer(String(c.iss || "")) || Number(c.exp || 0) * 1000 < Date.now()) return fail("invalid");
  const email = String(c.email || (params.provider === "microsoft" ? c.preferred_username : "") || "").toLowerCase();
  if (!email || (params.provider === "google" && c.email_verified !== true)) return fail("noemail");
  if (!domainAllowed(email)) return fail("domain");
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, isActive: true, mfaEnabled: true } });
  if (!user || !user.isActive) { await writeAuditLog({ action: "SSO_LOGIN_FAILED", metadata: { provider: params.provider, reason: "no_account" } }); return fail("noaccount"); }
  await createSession(user.id, req.headers.get("x-forwarded-for") || undefined, req.headers.get("user-agent") || undefined, !user.mfaEnabled);
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await writeAuditLog({ actorUserId: user.id, action: "LOGIN_SUCCESS", metadata: { via: `sso:${params.provider}` } });
  const r = NextResponse.redirect(`${origin}/dashboard`); r.cookies.delete("sso_flow"); return r;
}
