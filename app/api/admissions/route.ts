import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { erpAccess, edb } from "../../../lib/erp";
import { hashPassword } from "../../../lib/auth";
import { STAGES, stageLabel } from "../../../lib/admissions";
import { withErrors } from "../../../lib/apiHandler";

const clip = (v: unknown, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// Admission CRM: leads move from inquiry to enrolment; every change and contact is logged; an admitted lead becomes a student.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acc = await erpAccess(user);
  if (!acc.admissions) return NextResponse.json({ error: "Only the admissions team manages leads." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "add") {
      const name = clip(b.name, 100);
      if (!name || !(clip(b.phone) || clip(b.email))) return NextResponse.json({ error: "Name and a phone or email are needed." }, { status: 400 });
      const lead = await edb.admissionLead.create({ data: { chairmanId: acc.chairmanId, name, phone: clip(b.phone, 30), email: clip(b.email), city: clip(b.city, 60), program: clip(b.program, 100), source: clip(b.source, 40), ownerId: user.id, nextFollowUp: b.nextFollowUp ? new Date(b.nextFollowUp) : null, notes: clip(b.notes, 2000) } });
      await edb.leadActivity.create({ data: { leadId: lead.id, kind: "NOTE", text: "Lead added", byId: user.id } });
      return NextResponse.json({ ok: true });
    }
    const lead = (await edb.admissionLead.findFirst({ where: { id: String(b.leadId || ""), chairmanId: acc.chairmanId } })) as { id: string; name: string; stage: string; studentId: string | null; program: string | null } | null;
    if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    if (b.action === "stage") {
      if (!STAGES.some((s) => s[0] === b.stage)) return NextResponse.json({ error: "bad stage" }, { status: 400 });
      await edb.admissionLead.update({ where: { id: lead.id }, data: { stage: b.stage, ...(b.score !== undefined && b.score !== "" ? { score: Number(b.score) } : {}) } });
      await edb.leadActivity.create({ data: { leadId: lead.id, kind: "STAGE", text: `${stageLabel(lead.stage)} → ${stageLabel(b.stage)}${b.note ? `: ${String(b.note).slice(0, 300)}` : ""}`, byId: user.id } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "log") {
      const text = clip(b.text, 1000);
      if (!text) return NextResponse.json({ error: "Write what happened." }, { status: 400 });
      await edb.leadActivity.create({ data: { leadId: lead.id, kind: ["CALL", "EMAIL", "VISIT", "SMS", "NOTE"].includes(b.kind) ? b.kind : "NOTE", text, byId: user.id } });
      await edb.admissionLead.update({ where: { id: lead.id }, data: { nextFollowUp: b.nextFollowUp ? new Date(b.nextFollowUp) : null } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "enrol") {
      if (lead.studentId) return NextResponse.json({ error: "Already enrolled." }, { status: 409 });
      const batch = await prisma.batch.findFirst({ where: { id: String(b.batchId || ""), coordinator: { managedById: acc.chairmanId } } });
      const roll = clip(b.rollNumber, 40);
      if (!batch || !roll) return NextResponse.json({ error: "Choose the batch and give the roll number." }, { status: 400 });
      if (await prisma.student.count({ where: { batchId: batch.id, rollNumber: roll } })) return NextResponse.json({ error: "That roll number is already used in the batch." }, { status: 409 });
      const st = await prisma.student.create({ data: { batchId: batch.id, name: lead.name, rollNumber: roll, passwordHash: await hashPassword(roll), mustChangePassword: true } as never });
      await edb.admissionLead.update({ where: { id: lead.id }, data: { stage: "ENROLLED", studentId: st.id } });
      await edb.leadActivity.create({ data: { leadId: lead.id, kind: "STAGE", text: `Enrolled in ${batch.batchName} as ${roll}`, byId: user.id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Admissions are not set up yet — run prisma/migration_erp.sql." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
