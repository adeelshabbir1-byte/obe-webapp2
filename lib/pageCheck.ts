import crypto from "crypto";
import { prisma } from "./db";
import { navForRole } from "../components/reportNav";
import { HUBS } from "./hubMenu";

// "Check every page" for the demo (Super Admin): signs in as one demo person on the server, opens every page of their
// menu (and the hubs and newest pages), and reports each page's status, time and any error text it shows. The session
// it makes is deleted at the end. Only demo accounts are used.
const MARKERS: [RegExp, string][] = [[/Application error|a server-side exception has occurred/i, "crashed"], [/Run prisma\/migration[\w_.-]*\.sql|needs prisma\/migration/i, "needs a migration"], [/This page could not be found|NEXT_NOT_FOUND/i, "not found"], [/Something went wrong/i, "error message"]];
export type PageResult = { href: string; status: number; ms: number; problem: string | null; detail?: string };

export async function checkPages(origin: string, username: string, extra: string[] = [], offset = 0, limit = 24) {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, role: true } });
  if (!user) throw new Error(`${username} is not built yet.`);
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  await prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 10 * 60_000), mfaVerified: true, userAgent: "OBEHUB page check" } });
  const all = Array.from(new Set(["/dashboard", "/approvals", ...navForRole(user.role as never).map((l) => l.href), ...HUBS.map((h) => `/hub/${h.key}`), ...extra])).filter((h) => h.startsWith("/") && !h.includes("["));
  const hrefs = all.slice(offset, offset + limit);
  const out: PageResult[] = [];
  try {
    for (let i = 0; i < hrefs.length; i += 6) {
      await Promise.all(hrefs.slice(i, i + 6).map(async (href) => {
        const t = Date.now();
        try {
          const r = await fetch(origin + href, { headers: { cookie: `session_token=${raw}` }, redirect: "manual", signal: AbortSignal.timeout(25_000) });
          const body = r.status === 200 ? await r.text() : "";
          const hit = MARKERS.find(([re]) => re.test(body));
          const loc = r.headers.get("location") || "";
          const problem = r.status >= 500 ? "server error" : r.status === 404 ? "not found" : r.status >= 300 && r.status < 400 && /\/login|\/mfa-verify/.test(loc) ? "sent to sign-in" : hit ? hit[1] : null;
          out.push({ href, status: r.status, ms: Date.now() - t, problem, detail: hit ? (body.match(hit[0])?.[0] || "").slice(0, 120) : r.status >= 300 && r.status < 400 ? `→ ${loc}` : undefined });
        } catch (e) { out.push({ href, status: 0, ms: Date.now() - t, problem: "timed out / failed", detail: String((e as Error).message).slice(0, 120) }); }
      }));
    }
  } finally { await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => null); }
  return { results: out, next: offset + limit < all.length ? offset + limit : null, total: all.length };
}
