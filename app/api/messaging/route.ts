import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { xdb, configOf, sendAlert, alertStudents, normPhone, ALERT_KINDS } from "../../../lib/messaging";
import { parseCsv } from "../../../lib/lmsImport";
import { writeAuditLog } from "../../../lib/audit";

const s = (v: unknown, n = 500) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const SMS_KEYS = ["sid", "token", "from", "url", "method", "body", "localFormat", "failIf"], WA_KEYS = ["phoneNumberId", "token", "template", "lang", "sid", "from"];
const SECRET = new Set(["token"]);

// Institute Head: gateway settings, test message, broadcast to a batch / guardians / staff, student number import.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head manages SMS and WhatsApp." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cid = user.id;
  try {
    if (b.action === "save") {
      const prev = await configOf(cid);
      const merge = (keys: string[], prevJson: string | undefined, prefix: string) => { let o: Record<string, string> = {}; try { o = JSON.parse(prevJson || "{}"); } catch { o = {}; } for (const k of keys) { const v = s(b[`${prefix}_${k}`], 1000); if (SECRET.has(k) && !v) continue; o[k] = v; } return JSON.stringify(o); };
      const kinds = ALERT_KINDS.map(([k]) => k).filter((k) => b[`kind_${k}`]);
      const data = { smsProvider: ["NONE", "TWILIO", "HTTP"].includes(b.smsProvider) ? b.smsProvider : "NONE", waProvider: ["NONE", "META", "TWILIO"].includes(b.waProvider) ? b.waProvider : "NONE", smsJson: merge(SMS_KEYS, prev?.smsJson, "sms"), waJson: merge(WA_KEYS, prev?.waJson, "wa"), kindsJson: JSON.stringify(kinds), dailyLimit: Math.max(0, Math.min(100000, Number(b.dailyLimit) || 500)) };
      await xdb.messagingConfig.upsert({ where: { chairmanId: cid }, create: { chairmanId: cid, ...data }, update: data });
      await writeAuditLog({ actorUserId: user.id, action: "MESSAGING_SETTINGS_CHANGED", metadata: { sms: data.smsProvider, whatsapp: data.waProvider } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "test") {
      const to = normPhone(b.to);
      if (!to) return NextResponse.json({ error: "Enter a mobile number like 03001234567." }, { status: 400 });
      const r = await sendAlert(cid, "TEST", [{ to, whatsapp: b.channel !== "SMS" }], "OBEHUB test message", "If you received this, alerts are working.", true);
      const last = (await xdb.messageLog.findFirst({ where: { chairmanId: cid }, orderBy: { createdAt: "desc" } })) as { status: string; error: string | null; channel: string } | null;
      return r.sent ? NextResponse.json({ ok: true, note: `Sent by ${last?.channel}.` }) : NextResponse.json({ error: last?.error || r.reason || "Not sent." }, { status: 400 });
    }
    if (b.action === "broadcast") {
      const title = s(b.title, 120), text = s(b.text, 450);
      if (!title) return NextResponse.json({ error: "Write the message." }, { status: 400 });
      let r;
      if (String(b.audience || "").startsWith("batch:")) {
        const batch = await prisma.batch.findFirst({ where: { id: String(b.audience).slice(6), coordinator: { managedById: cid } }, select: { id: true } });
        if (!batch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });
        const ids = (await prisma.student.findMany({ where: { batchId: batch.id }, select: { id: true } })).map((x) => x.id);
        r = await alertStudents(cid, ids, "BROADCAST", title, text, !!b.guardians);
      } else {
        const role = String(b.audience || "").replace(/^role:/, "");
        const staff = await prisma.user.findMany({ where: { isActive: true, OR: [{ managedById: cid }, { managedBy: { managedById: cid } }], ...(role && role !== "ALL" ? { role: role as never } : {}) }, select: { id: true } });
        const phones = (await prisma.facultyProfile.findMany({ where: { userId: { in: staff.map((x) => x.id) }, phone: { not: null } }, select: { phone: true } })).map((p) => ({ to: p.phone! }));
        r = await sendAlert(cid, "BROADCAST", phones, title, text);
      }
      await writeAuditLog({ actorUserId: user.id, action: "BROADCAST_SENT", metadata: { audience: String(b.audience || ""), sent: r?.sent ?? 0 } });
      return NextResponse.json({ ok: true, note: `Sent ${r?.sent ?? 0}, failed ${r?.failed ?? 0}${r?.reason ? ` — ${r.reason}` : ""}` });
    }
    if (b.action === "importContacts") {
      const rows = parseCsv(String(b.csv || "")).slice(1);
      const roll = new Map((await prisma.student.findMany({ where: { batch: { coordinator: { managedById: cid } } }, select: { id: true, rollNumber: true } })).map((x) => [x.rollNumber.trim().toLowerCase(), x.id]));
      let n = 0, bad = 0;
      for (const r of rows.slice(0, 5000)) {
        const id = roll.get(String(r[0] || "").trim().toLowerCase()); const ph = normPhone(r[1]), gp = normPhone(r[2]);
        if (!id || (!ph && !gp)) { bad++; continue; }
        await xdb.studentContact.upsert({ where: { studentId: id }, create: { studentId: id, phone: ph, guardianPhone: gp }, update: { ...(ph ? { phone: ph } : {}), ...(gp ? { guardianPhone: gp } : {}) } }); n++;
      }
      return NextResponse.json({ ok: true, note: `Saved ${n} students' numbers${bad ? `, skipped ${bad} rows (unknown roll number or invalid number)` : ""}.` });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_messaging.sql first." }, { status: 500 }); }
}
