import crypto from "crypto";
import { prisma } from "./db";

// Optional read-only link to a teacher's Google or Outlook calendar, used only for free / busy (never event titles).
// Needs, in the environment: CALENDAR_TOKEN_KEY (any long random string — encrypts the stored token and signs the
// sign-in state), and GOOGLE_CALENDAR_CLIENT_ID + GOOGLE_CALENDAR_CLIENT_SECRET and / or MS_CALENDAR_CLIENT_ID +
// MS_CALENDAR_CLIENT_SECRET. Without them the link buttons are hidden and nothing else changes.

const db = prisma as unknown as Record<string, any>;
export type Provider = "GOOGLE" | "MICROSOFT";
const CONF: Record<Provider, { id: string; secret: string; auth: string; token: string; scope: string; label: string }> = {
  GOOGLE: { id: "GOOGLE_CALENDAR_CLIENT_ID", secret: "GOOGLE_CALENDAR_CLIENT_SECRET", auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/calendar.freebusy", label: "Google Calendar" },
  MICROSOFT: { id: "MS_CALENDAR_CLIENT_ID", secret: "MS_CALENDAR_CLIENT_SECRET", auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", scope: "offline_access Calendars.ReadBasic", label: "Outlook" },
};
export const providerLabel = (p: string) => CONF[p as Provider]?.label || p;
const key = () => (process.env.CALENDAR_TOKEN_KEY ? crypto.createHash("sha256").update(process.env.CALENDAR_TOKEN_KEY).digest() : null);
/** Providers that are set up on this server. */
export function linkProviders(): Provider[] {
  if (!key()) return [];
  return (Object.keys(CONF) as Provider[]).filter((p) => process.env[CONF[p].id] && process.env[CONF[p].secret]);
}
export const asProvider = (s: string): Provider | null => (s === "google" || s === "GOOGLE" ? "GOOGLE" : s === "microsoft" || s === "MICROSOFT" ? "MICROSOFT" : null);

function encrypt(text: string) {
  const k = key()!, iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
function decrypt(blob: string) {
  const k = key();
  if (!k) return null;
  try {
    const [iv, tag, enc] = blob.split(".").map((x) => Buffer.from(x, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}
const sign = (s: string) => crypto.createHmac("sha256", key()!).update(s).digest("base64url");
/** Signed sign-in state: who started it and when (valid 15 minutes). */
export function makeState(userId: string) { const s = `${userId}.${Date.now()}`; return `${Buffer.from(s).toString("base64url")}.${sign(s)}`; }
export function readState(state: string) {
  const [b, sig] = String(state || "").split(".");
  if (!b || !sig || !key()) return null;
  const s = Buffer.from(b, "base64url").toString();
  const a = Buffer.from(sign(s)), g = Buffer.from(sig);
  if (a.length !== g.length || !crypto.timingSafeEqual(a, g)) return null;
  const [userId, t] = s.split(".");
  return Date.now() - Number(t) < 15 * 60000 ? userId : null;
}

export function authUrl(p: Provider, userId: string, redirect: string) {
  const c = CONF[p];
  const q = new URLSearchParams({ client_id: process.env[c.id]!, redirect_uri: redirect, response_type: "code", scope: c.scope, state: makeState(userId), ...(p === "GOOGLE" ? { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } : { prompt: "select_account" }) });
  return `${c.auth}?${q}`;
}
async function token(p: Provider, body: Record<string, string>) {
  const c = CONF[p];
  const r = await fetch(c.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env[c.id]!, client_secret: process.env[c.secret]!, ...body }) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `Sign-in failed (${r.status}).`);
  return j;
}
/** Finishes the sign-in: keeps only the refresh token, encrypted. */
export async function finishLink(p: Provider, userId: string, code: string, redirect: string) {
  const j = await token(p, { grant_type: "authorization_code", code, redirect_uri: redirect, ...(p === "MICROSOFT" ? { scope: CONF[p].scope } : {}) });
  if (!j.refresh_token) throw new Error("The calendar did not allow offline access. Remove OBEHUB from the account's connected apps and try again.");
  const enc = encrypt(j.refresh_token);
  await db.calendarLink.upsert({ where: { userId_provider: { userId, provider: p } }, create: { userId, provider: p, refreshTokenEnc: enc }, update: { refreshTokenEnc: enc, busyJson: null, busyAt: null } });
}
export async function unlink(userId: string, p: Provider) { await db.calendarLink.deleteMany({ where: { userId, provider: p } }); }
export async function linksOf(userId: string): Promise<{ provider: Provider; busyAt: Date | null }[]> {
  return db.calendarLink.findMany({ where: { userId }, select: { provider: true, busyAt: true } }).catch(() => []);
}

/** Busy times from the linked calendars for the range (cached 15 minutes). Never fails: on error it returns what it has. */
export async function externalBusy(userId: string, from: number, to: number): Promise<{ start: number; end: number; provider: Provider }[]> {
  if (!key()) return [];
  const links = (await db.calendarLink.findMany({ where: { userId } }).catch(() => [])) as { provider: Provider; refreshTokenEnc: string; busyJson: string | null; busyAt: Date | null }[];
  const out: { start: number; end: number; provider: Provider }[] = [];
  for (const l of links) {
    if (!linkProviders().includes(l.provider)) continue;
    let cache: { from: number; to: number; list: { start: number; end: number }[] } | null = null;
    try { cache = l.busyJson ? JSON.parse(l.busyJson) : null; } catch { cache = null; }
    let list = cache && l.busyAt && Date.now() - new Date(l.busyAt).getTime() < 15 * 60000 && cache.from <= from && cache.to >= to ? cache.list : null;
    if (!list) {
      list = await fetchBusy(l.provider, l.refreshTokenEnc, from, to).catch((e) => { console.warn("calendar free/busy:", (e as Error).message); return null; });
      if (list) await db.calendarLink.update({ where: { userId_provider: { userId, provider: l.provider } }, data: { busyJson: JSON.stringify({ from, to, list }), busyAt: new Date() } }).catch(() => null);
    }
    for (const b of list || []) out.push({ ...b, provider: l.provider });
  }
  return out;
}
async function fetchBusy(p: Provider, enc: string, from: number, to: number) {
  const refresh = decrypt(enc);
  if (!refresh) throw new Error("stored token unreadable");
  const t = await token(p, { grant_type: "refresh_token", refresh_token: refresh, ...(p === "MICROSOFT" ? { scope: CONF[p].scope } : {}) });
  const h = { Authorization: `Bearer ${t.access_token}` };
  if (p === "GOOGLE") {
    const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), items: [{ id: "primary" }] }) });
    const j = (await r.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    if (!r.ok) throw new Error(`Google ${r.status}`);
    return (j.calendars?.primary?.busy || []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  }
  const q = new URLSearchParams({ startDateTime: new Date(from).toISOString(), endDateTime: new Date(to).toISOString(), $select: "start,end,showAs", $top: "200" });
  const r = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`, { headers: { ...h, Prefer: 'outlook.timezone="UTC"' } });
  const j = (await r.json()) as { value?: { start: { dateTime: string }; end: { dateTime: string }; showAs?: string }[] };
  if (!r.ok) throw new Error(`Outlook ${r.status}`);
  return (j.value || []).filter((e) => e.showAs !== "free").map((e) => ({ start: Date.parse(`${e.start.dateTime.replace(/Z?$/, "")}Z`), end: Date.parse(`${e.end.dateTime.replace(/Z?$/, "")}Z`) }));
}
