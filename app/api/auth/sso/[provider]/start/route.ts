import { NextResponse } from "next/server";
import { provider, randomToken, challengeOf, appOrigin } from "../../../../../../lib/sso";

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const p = provider(params.provider);
  const origin = appOrigin(req);
  if (!p || !p.clientId || !p.secret) return NextResponse.redirect(`${origin}/login?sso=off`);
  const state = randomToken(), nonce = randomToken(), verifier = randomToken();
  const url = new URL(p.auth);
  url.search = new URLSearchParams({ client_id: p.clientId, response_type: "code", scope: "openid email profile", redirect_uri: `${origin}/api/auth/sso/${params.provider}/callback`, state, nonce, code_challenge: challengeOf(verifier), code_challenge_method: "S256", prompt: "select_account" }).toString();
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("sso_flow", [params.provider, state, nonce, verifier].join("."), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/auth/sso" });
  return res;
}
