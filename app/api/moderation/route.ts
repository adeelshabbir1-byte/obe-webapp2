import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, HeadingLevel, PageOrientation } from "docx";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { chairmanIdFor } from "../../../lib/reportScope";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { createExaminer, examinerByToken, addRemark, moderationLog, mdb, MOD_HINT, MOD_ROLES } from "../../../lib/moderation";


/** GET ?format=docx — the moderation log of the person's courses as a Word document (for the SAR). */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !MOD_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const where = await reviewBatchWhere(user);
  if (!where) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const courses = await prisma.course.findMany({ where: { batch: where }, select: { id: true } });
  const rows = await moderationLog(courses.map((c) => c.id));
  const cell = (t: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t || "—", bold, size: 17 })] })] });
  const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Moderation log")] }),
    new Paragraph({ children: [new TextRun({ text: `Every paper and result vetted, with who, when, comments and changes. ${rows.length} entries. Prepared ${new Date().toLocaleDateString("en-GB")}.`, size: 19 })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: ["Date", "Course", "What", "Who", "Decision", "Comments", "Changes / checklist"].map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: [cell(new Date(r.at).toLocaleDateString("en-GB")), cell(r.course), cell(r.what), cell(r.who), cell(r.decision), cell(r.comments), cell(r.changes)] }))] }),
  ] }] });
  const buf = await Packer.toBuffer(doc);
  return new NextResponse(buf as unknown as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="Moderation log ${new Date().toISOString().slice(0, 10)}.docx"` } });
}

/**
 * POST JSON
 *   { action: "examiner", name, email, organisation, designation, courseIds[], days } — a temporary link for an outside examiner
 *   { action: "revoke", id }
 *   { action: "remark", token, courseId, kind: "PAPER"|"RESULT", decision: "OK"|"CHANGES", comments, clarity } — the external examiner (no account)
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "remark") {
      const ex = await examinerByToken(String(b.token || ""));
      if (!ex) return NextResponse.json({ error: "This link has expired or was withdrawn." }, { status: 403 });
      const courseId = String(b.courseId || "");
      if (!(JSON.parse(ex.courseIdsJson) as string[]).includes(courseId)) return NextResponse.json({ error: "This course was not given to you." }, { status: 403 });
      const comments = String(b.comments || "").trim().slice(0, 4000);
      const decision = b.decision === "CHANGES" ? "CHANGES" : "OK";
      if (decision === "CHANGES" && !comments) return NextResponse.json({ error: "Please say what should change." }, { status: 400 });
      const kind = b.kind === "RESULT" ? "RESULT" : "PAPER";
      await addRemark({ chairmanId: ex.chairmanId, kind, courseId, examType: kind === "PAPER" ? "Final" : null, round: null, byKind: "EXTERNAL", byUserId: null, examinerId: ex.id, decision, comments: comments || null, checklistJson: typeof b.clarity === "boolean" ? JSON.stringify([{ key: "clarity", label: "Questions are clear", auto: false, ok: b.clarity }]) : null });
      const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, instructorId: true, coordinatorId: true } });
      await notifyUsers([c?.instructorId, c?.coordinatorId], { kind: "MODERATION", title: `External examiner on ${c?.code} ${kind === "PAPER" ? "final paper" : "result"}: ${decision === "OK" ? "satisfactory" : "changes suggested"}`, body: comments.slice(0, 200) || undefined, href: "/moderation" });
      await writeAuditLog({ actorUserId: null as never, action: "EXTERNAL_EXAMINER_REMARK", entityType: "Course", entityId: courseId, metadata: { examinerId: ex.id, kind, decision } });
      return NextResponse.json({ ok: true });
    }
    const user = await getAuthenticatedUser();
    if (!user || !user.mfaVerified || !MOD_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const cid = await chairmanIdFor(user);
    if (b.action === "examiner") {
      const where = await reviewBatchWhere(user);
      const ids = Array.isArray(b.courseIds) ? b.courseIds.map(String).slice(0, 40) : [];
      const ok = where ? await prisma.course.findMany({ where: { id: { in: ids.concat(["none"]) }, batch: where }, select: { id: true } }) : [];
      const name = String(b.name || "").trim(), email = String(b.email || "").trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Give the examiner's name and email." }, { status: 400 });
      if (!ok.length) return NextResponse.json({ error: "Choose at least one course." }, { status: 400 });
      const token = await createExaminer({ chairmanId: cid, name, email, organisation: b.organisation, designation: b.designation, courseIds: ok.map((c) => c.id), days: Number(b.days) || 14, by: user.id });
      await writeAuditLog({ actorUserId: user.id, action: "EXTERNAL_EXAMINER_INVITED", entityType: "ExternalExaminer", entityId: email, metadata: { courses: ok.length, days: Number(b.days) || 14 } });
      return NextResponse.json({ ok: true, link: `/external/${token}` });
    }
    if (b.action === "revoke") {
      await mdb.externalExaminer.updateMany({ where: { id: String(b.id || ""), chairmanId: cid }, data: { revokedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "EXTERNAL_EXAMINER_REVOKED", entityType: "ExternalExaminer", entityId: String(b.id || ""), metadata: {} });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? MOD_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
