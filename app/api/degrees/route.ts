import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, rdb, str, num, dateOrNull } from "../../../lib/registers";
import { DEG_HINT, OFFICES, REQUESTERS, RESPONSES, canManageDegrees, allCleared, nextSerial, matchRequest } from "../../../lib/degrees";
import { degreeAudit } from "../../../lib/transcriptPlus";
import { computeCgpa } from "../../../lib/academicStanding";

/**
 * POST { action, ... }
 *   clear { studentId, office, note, undo } — the office's clearance (Librarian, Finance Officer, Student Affairs, HOD/Program Lead)
 *   issue { studentId, degreeTitle, convocationId } — the next serial (all cleared and the degree audit passed)
 *   legacy { rollNumber, studentName, fatherName, program, degreeTitle, cgpa, serialNo, issuedAt } — a degree issued before OBEHUB
 *   cancel { id, note }    convocation { title, date, venue }    assign { id, convocationId }
 *   request { requesterKind, requesterName, reference, rollNumber, serialNo, studentName, receivedAt }    respond { id, response, responseNote }
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ownStudent = async (id: string) => prisma.student.findFirst({ where: { id, batch: { coordinator: { managedById: w.chairmanId } } }, select: { id: true, name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true, coordinatorId: true } } } });
  try {
    if (b.action === "clear") {
      const office = OFFICES.find((o) => o.key === b.office);
      if (!office || !office.can(w)) return NextResponse.json({ error: `Only ${office?.who || "the office"} clears this.` }, { status: 403 });
      const st = await ownStudent(String(b.studentId || ""));
      if (!st) return NextResponse.json({ error: "Student not found." }, { status: 404 });
      if (office.key === "department" && w.lead && st.batch.coordinatorId !== w.id) return NextResponse.json({ error: "Not your program's student." }, { status: 403 });
      const undo = !!b.undo;
      // The library clears only when no book is out and no fine is unpaid (library circulation).
      if (office.key === "library" && !undo) { const block = await (await import("../../../lib/library")).libraryBlock(st.id); if (block) return NextResponse.json({ error: block }, { status: 400 }); }
      const data = { [`${office.key}At`]: undo ? null : new Date(), [`${office.key}ById`]: undo ? null : w.id, [`${office.key}Note`]: str(b.note, 300) || null, updatedAt: new Date() };
      await rdb.degreeClearance.upsert({ where: { studentId: st.id }, create: { studentId: st.id, chairmanId: w.chairmanId, ...data }, update: data });
      await writeAuditLog({ actorUserId: w.id, action: undo ? "DEGREE_CLEARANCE_WITHDRAWN" : "DEGREE_CLEARED", entityType: "DegreeClearance", entityId: st.id, metadata: { office: office.key } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "request") {
      const kind = REQUESTERS[String(b.requesterKind)] ? String(b.requesterKind) : "OTHER";
      const name = str(b.requesterName, 160);
      if (!name || (!str(b.rollNumber) && !str(b.serialNo))) return NextResponse.json({ error: "Give who is asking and the roll number or the degree serial." }, { status: 400 });
      if (!canManageDegrees(w) && !w.leader) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const m = await matchRequest(w.chairmanId, { serialNo: str(b.serialNo, 40), rollNumber: str(b.rollNumber, 40), studentName: str(b.studentName, 120) });
      const id = randomUUID();
      await rdb.degreeVerification.create({ data: { id, chairmanId: w.chairmanId, requesterKind: kind, requesterName: name, reference: str(b.reference, 120) || null, rollNumber: str(b.rollNumber, 40) || null, serialNo: str(b.serialNo, 40) || null, studentName: str(b.studentName, 120) || null, receivedAt: dateOrNull(b.receivedAt) || new Date(), degreeIssueId: m.issue?.id || null, createdById: w.id } });
      await writeAuditLog({ actorUserId: w.id, action: "DEGREE_VERIFICATION_RECEIVED", entityType: "DegreeVerification", entityId: id, metadata: { kind, match: m.suggest } });
      return NextResponse.json({ ok: true, id, suggest: m.suggest });
    }
    if (!canManageDegrees(w)) return NextResponse.json({ error: "Only the institute head, the Dean or the Controller of Examinations does this." }, { status: 403 });
    if (b.action === "issue") {
      const st = await ownStudent(String(b.studentId || ""));
      if (!st) return NextResponse.json({ error: "Student not found." }, { status: 404 });
      if (await rdb.degreeIssue.findFirst({ where: { chairmanId: w.chairmanId, studentId: st.id, cancelledAt: null } })) return NextResponse.json({ error: "A degree is already issued to this student." }, { status: 400 });
      const cl = await rdb.degreeClearance.findUnique({ where: { studentId: st.id } });
      { const block = await (await import("../../../lib/library")).libraryBlock(st.id); if (block) return NextResponse.json({ error: block }, { status: 400 }); }
      if (!allCleared(cl)) return NextResponse.json({ error: `Not cleared yet by: ${OFFICES.filter((o) => !cl?.[`${o.key}At`]).map((o) => o.label).join(", ")}.` }, { status: 400 });
      const audit = await degreeAudit(st.id);
      if (!audit?.eligible) return NextResponse.json({ error: `The degree audit does not pass: ${(audit?.graduation || []).filter((g) => !g.ok).map((g) => g.label).join("; ") || "requirements not met"}.` }, { status: 400 });
      const issuedAt = new Date();
      const serialNo = await nextSerial(w.chairmanId, issuedAt.getFullYear());
      const detail = (await rdb.studentDetail.findUnique({ where: { studentId: st.id } }).catch(() => null)) as { dataJson: string } | null;
      let father: string | null = null; try { father = detail ? JSON.parse(detail.dataJson).father || null : null; } catch { father = null; }
      const cgpa = await computeCgpa(st.id);
      const id = randomUUID();
      await rdb.degreeIssue.create({ data: { id, chairmanId: w.chairmanId, studentId: st.id, rollNumber: st.rollNumber, studentName: st.name, fatherName: father, program: st.batch.degreeProgram, degreeTitle: str(b.degreeTitle, 160) || st.batch.degreeProgram, cgpa: cgpa === null ? null : Math.round(cgpa * 100) / 100, serialNo, issuedAt, convocationId: str(b.convocationId, 60) || null, issuedById: w.id } });
      await writeAuditLog({ actorUserId: w.id, action: "DEGREE_ISSUED", entityType: "DegreeIssue", entityId: id, metadata: { serialNo } });
      return NextResponse.json({ ok: true, serialNo });
    }
    if (b.action === "legacy") {
      const roll = str(b.rollNumber, 40), name = str(b.studentName, 120), program = str(b.program, 120), serial = str(b.serialNo, 40);
      if (!roll || !name || !program || !serial) return NextResponse.json({ error: "Give the roll number, name, program and serial number." }, { status: 400 });
      if (await rdb.degreeIssue.findFirst({ where: { chairmanId: w.chairmanId, serialNo: serial } })) return NextResponse.json({ error: "This serial number is already in the register." }, { status: 400 });
      await rdb.degreeIssue.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, rollNumber: roll, studentName: name, fatherName: str(b.fatherName, 120) || null, program, degreeTitle: str(b.degreeTitle, 160) || program, cgpa: num(b.cgpa), serialNo: serial, issuedAt: dateOrNull(b.issuedAt) || new Date(), issuedById: w.id } });
      await writeAuditLog({ actorUserId: w.id, action: "DEGREE_LEGACY_ADDED", entityType: "DegreeIssue", entityId: serial, metadata: {} });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "cancel") {
      const note = str(b.note, 500);
      if (!note) return NextResponse.json({ error: "Give the reason for cancelling." }, { status: 400 });
      await rdb.degreeIssue.updateMany({ where: { id: String(b.id || ""), chairmanId: w.chairmanId }, data: { cancelledAt: new Date(), cancelNote: note } });
      await writeAuditLog({ actorUserId: w.id, action: "DEGREE_CANCELLED", entityType: "DegreeIssue", entityId: String(b.id || ""), metadata: {} });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "convocation") {
      const title = str(b.title, 160), date = dateOrNull(b.date);
      if (!title || !date) return NextResponse.json({ error: "Give the convocation's title and date." }, { status: 400 });
      await rdb.convocation.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, title, date, venue: str(b.venue, 160) || null } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "assign") {
      await rdb.degreeIssue.updateMany({ where: { id: String(b.id || ""), chairmanId: w.chairmanId }, data: { convocationId: str(b.convocationId, 60) || null } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "respond") {
      const v = await rdb.degreeVerification.findUnique({ where: { id: String(b.id || "") } });
      if (!v || v.chairmanId !== w.chairmanId) return NextResponse.json({ error: "Request not found." }, { status: 404 });
      const response = RESPONSES[String(b.response)] ? String(b.response) : null;
      if (!response) return NextResponse.json({ error: "Choose the answer." }, { status: 400 });
      await rdb.degreeVerification.update({ where: { id: v.id }, data: { response, responseNote: str(b.responseNote, 2000) || null, respondedAt: new Date(), respondedById: w.id } });
      await writeAuditLog({ actorUserId: w.id, action: "DEGREE_VERIFICATION_ANSWERED", entityType: "DegreeVerification", entityId: v.id, metadata: { response } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? DEG_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";
