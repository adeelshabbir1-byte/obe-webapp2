import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// SMS and WhatsApp alerts. Sending never throws and never blocks the action that caused it.
// SMS: Twilio, or any Pakistani bulk-SMS gateway with an HTTP API (URL with {to} and {message}).
// WhatsApp: Meta WhatsApp Cloud API (approved template with two text parameters) or Twilio WhatsApp.
export const xdb = prisma as unknown as Record<string, any>;
export type MsgConfig = { chairmanId: string; smsProvider: string; smsJson: string; waProvider: string; waJson: string; kindsJson: string; dailyLimit: number };
export const ALERT_KINDS: [string, string][] = [["DEADLINE", "Deadlines and reminders"], ["ASSIGNMENT", "New assignments of work"], ["RESULT", "Result submitted / approved"], ["GRADE_CHANGE", "Grade changes"], ["QUIZ", "Online quiz opened (students)"], ["HANDIN", "New hand-in opened (students)"], ["RESULT_STUDENT", "Results published (students)"], ["BROADCAST", "Messages sent from this page"]];

/** Pakistani numbers to international form: 0300-1234567 → +923001234567. */
export function normPhone(raw: string | null | undefined): string | null {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("03") && s.length === 11) s = "+92" + s.slice(1);
  if (s.startsWith("3") && s.length === 10) s = "+92" + s;
  if (s.startsWith("92") && s.length === 12) s = "+" + s;
  return /^\+\d{10,15}$/.test(s) ? s : null;
}
const parse = (j: string) => { try { return JSON.parse(j) as Record<string, string>; } catch { return {} as Record<string, string>; } };
export const mask = (v?: string) => (v ? `••••${v.slice(-4)}` : "");

export async function configOf(chairmanId: string) {
  return (await xdb.messagingConfig.findUnique({ where: { chairmanId } }).catch(() => null)) as MsgConfig | null;
}

async function sendSms(c: MsgConfig, to: string, text: string): Promise<string | null> {
  const k = parse(c.smsJson);
  if (c.smsProvider === "TWILIO") {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${k.sid}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${k.sid}:${k.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: to, From: k.from, Body: text }) });
    return r.ok ? null : `Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`;
  }
  if (c.smsProvider === "HTTP") {
    // e.g. https://api.gateway.pk/send?api_key=XYZ&sender=UNI&to={to}&message={message}
    const local = to.replace(/^\+92/, "0");
    const fill = (t: string) => t.replace(/\{to\}/g, encodeURIComponent(k.localFormat === "yes" ? local : to.replace(/^\+/, ""))).replace(/\{message\}/g, encodeURIComponent(text));
    const r = await fetch(fill(k.url || ""), k.method === "POST" ? { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fill(k.body || "") } : undefined);
    const t = (await r.text()).slice(0, 300);
    return r.ok && !(k.failIf && t.toLowerCase().includes(k.failIf.toLowerCase())) ? null : `Gateway ${r.status}: ${t}`;
  }
  return "SMS not set up";
}

async function sendWhatsApp(c: MsgConfig, to: string, title: string, body: string): Promise<string | null> {
  const k = parse(c.waJson);
  if (c.waProvider === "META") {
    const r = await fetch(`https://graph.facebook.com/v20.0/${k.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${k.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: k.template || "obehub_alert", language: { code: k.lang || "en" }, components: [{ type: "body", parameters: [{ type: "text", text: title.slice(0, 200) }, { type: "text", text: (body || "-").replace(/\s+/g, " ").slice(0, 900) }] }] } }) });
    return r.ok ? null : `WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`;
  }
  if (c.waProvider === "TWILIO") {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${k.sid}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${k.sid}:${k.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${k.from}`, Body: `${title}\n${body}` }) });
    return r.ok ? null : `Twilio WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`;
  }
  return "WhatsApp not set up";
}

/** Send one alert to a list of numbers on the institute's channels (WhatsApp first where on, else SMS). Returns counts. */
export async function sendAlert(chairmanId: string, kind: string, phones: { to: string; whatsapp?: boolean }[], title: string, body = "", force = false) {
  const c = await configOf(chairmanId);
  if (!c || (c.smsProvider === "NONE" && c.waProvider === "NONE")) return { sent: 0, failed: 0, skipped: phones.length, reason: "No gateway set up." };
  const kinds = (() => { try { return JSON.parse(c.kindsJson) as string[]; } catch { return []; } })();
  if (!force && !kinds.includes(kind)) return { sent: 0, failed: 0, skipped: phones.length, reason: "This alert type is turned off." };
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const used = (await xdb.messageLog.count({ where: { chairmanId, createdAt: { gte: since } } }).catch(() => 0)) as number;
  const room = Math.max(0, c.dailyLimit - used);
  const list = Array.from(new Map(phones.map((p) => [normPhone(p.to), p] as const)).entries()).filter(([n]) => !!n).slice(0, room);
  const text = `${title}${body ? `\n${body}` : ""}`.slice(0, 600);
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(async ([to, p]) => {
      const useWa = c.waProvider !== "NONE" && p.whatsapp !== false;
      let err = useWa ? await sendWhatsApp(c, to!, title, body).catch((e) => String(e)) : "skip";
      let channel = "WHATSAPP";
      if (err && c.smsProvider !== "NONE") { channel = "SMS"; err = await sendSms(c, to!, text).catch((e) => String(e)); }
      if (err) failed++; else sent++;
      await xdb.messageLog.create({ data: { chairmanId, channel, to: to!, body: text, status: err ? "FAILED" : "SENT", error: err ? err.slice(0, 500) : null, kind } }).catch(() => null);
    }));
  }
  return { sent, failed, skipped: phones.length - list.length, reason: list.length < phones.length ? "Some numbers were missing/invalid or the daily limit was reached." : "" };
}

/** Staff alerts from in-app notifications (called by notifyUsers). Uses the phone on each person's faculty profile. */
export async function alertStaff(userIds: string[], kind: string, title: string, body?: string) {
  try {
    const users = await prisma.user.findMany({ where: { id: { in: userIds.slice(0, 200) }, isActive: true }, select: { id: true, role: true, managedById: true } });
    if (!users.length) return;
    const phones = new Map((await prisma.facultyProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { userId: true, phone: true } })).map((p) => [p.userId, p.phone]));
    const byInst = new Map<string, { to: string }[]>();
    for (const u of users) { const ph = phones.get(u.id); if (!ph) continue; const cid = await chairmanIdFor(u).catch(() => ""); if (!cid) continue; byInst.set(cid, [...(byInst.get(cid) || []), { to: ph }]); }
    for (const [cid, list] of byInst) await sendAlert(cid, kind, list, title, body);
  } catch { /* best effort */ }
}

/** Student alerts (and optionally guardians) by the numbers they gave under Alerts & Contact. */
export async function alertStudents(chairmanId: string, studentIds: string[], kind: string, title: string, body?: string, guardians = false) {
  try {
    const cs = (await xdb.studentContact.findMany({ where: { studentId: { in: studentIds } } })) as { phone: string | null; guardianPhone: string | null; whatsapp: boolean }[];
    const list = cs.flatMap((c) => [c.phone ? { to: c.phone, whatsapp: c.whatsapp } : null, guardians && c.guardianPhone ? { to: c.guardianPhone } : null]).filter((x): x is { to: string; whatsapp: boolean } => !!x);
    return await sendAlert(chairmanId, kind, list, title, body);
  } catch { return { sent: 0, failed: 0, skipped: studentIds.length, reason: "Contacts are not set up." }; }
}
