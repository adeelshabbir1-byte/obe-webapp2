import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { writeAuditLog } from "../../../lib/audit";
import { prisma } from "../../../lib/db";
import { raise, decide, decideCredit, savePolicy, canRaise, stageApprovers, STATUS_HINT, GRADES, type Req } from "../../../lib/studentStatus";
import { transferPack } from "../../../lib/transferPack";
import { EXAM_CONTROLLER } from "../../../lib/academicRules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const sdb = prisma as unknown as Record<string, any>;

/** May this person see this request? Raiser, the student's Program Lead, approvers, and the institute's leadership. */
async function canSee(user: { id: string; role: string; managedById: string | null; extraRoles?: string[] | null }, r: Req) {
  if (r.raisedById === user.id) return true;
  const chairmanId = await chairmanIdFor(user);
  if (chairmanId !== r.chairmanId) return false;
  if (["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role) || (user.extraRoles || []).includes(EXAM_CONTROLLER)) return true;
  if (await canRaise(user, r.studentId)) return true;
  for (const s of ["HOD", "CONTROLLER"]) if ((await stageApprovers(r, s)).ids.includes(user.id)) return true;
  if (r.targetBatchId) { const b = await prisma.batch.findUnique({ where: { id: r.targetBatchId }, select: { coordinatorId: true } }); if (b?.coordinatorId === user.id) return true; }
  return false;
}

// GET ?doc=<requestId> — the supporting document; ?pack=<requestId> — the transfer-out transcript and outlines pack.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("doc") || req.nextUrl.searchParams.get("pack") || "";
  try {
    const r = (await sdb.studentStatusRequest.findUnique({ where: { id } })) as (Req & { docData: string | null }) | null;
    if (!r || !(await canSee(user, r))) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (req.nextUrl.searchParams.get("doc")) {
      if (!r.docData) return NextResponse.json({ error: "No document." }, { status: 404 });
      return new NextResponse(Buffer.from(r.docData, "base64"), { headers: { "Content-Type": r.docType || "application/octet-stream", "Content-Disposition": `inline; filename="${(r.docName || "document").replace(/["\r\n]/g, "")}"` } });
    }
    const p = await transferPack(r.studentId);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    await writeAuditLog({ actorUserId: user.id, action: "TRANSFER_PACK_DOWNLOADED", entityType: "Student", entityId: r.studentId, metadata: { requestId: r.id } }).catch(() => null);
    return new NextResponse(p.buffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${p.name}"` } });
  } catch {
    return NextResponse.json({ error: STATUS_HINT }, { status: 503 });
  }
}

// POST { action: "raise" | "decide" | "credit" | "cancel" | "policy", … }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "raise") {
      const eff = new Date(String(b.effectiveDate || ""));
      if (isNaN(+eff)) return NextResponse.json({ error: "Give the effective date." }, { status: 400 });
      const id = await raise(user, {
        studentId: String(b.studentId || ""), type: String(b.type || ""), effectiveDate: eff, reason: String(b.reason || ""), freezeSemesters: b.freezeSemesters ? Number(b.freezeSemesters) : null,
        targetBatchId: b.targetBatchId ? String(b.targetBatchId) : null, otherInstitute: b.otherInstitute ? String(b.otherInstitute) : null, caseReference: b.caseReference ? String(b.caseReference) : null,
        doc: b.doc?.data ? { name: String(b.doc.name || "document").slice(0, 120), type: String(b.doc.type || ""), data: String(b.doc.data) } : null,
        credits: Array.isArray(b.credits) ? b.credits : [], suggested: !!b.suggested,
      });
      return NextResponse.json({ ok: true, id });
    }
    if (b.action === "decide") {
      await decide(user, String(b.id || ""), b.approve === true, String(b.remarks || ""), { feeCleared: b.feeCleared === true });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "credit") {
      await decideCredit(user, String(b.creditId || ""), b.accept === true, b.toCode ? String(b.toCode) : null, b.note ? String(b.note) : null);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "cancel") {
      const r = (await sdb.studentStatusRequest.findUnique({ where: { id: String(b.id || "") } })) as Req | null;
      if (!r || r.raisedById !== user.id || r.status !== "PENDING") return NextResponse.json({ error: "Only the person who raised a pending request can withdraw it." }, { status: 403 });
      await sdb.studentStatusRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "STUDENT_STATUS_WITHDRAWN", entityType: "Student", entityId: r.studentId, metadata: { requestId: r.id } }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "policy") {
      const chairmanId = await chairmanIdFor(user);
      if (!(user.role === "CHAIRMAN" || (user.extraRoles || []).includes(EXAM_CONTROLLER))) return NextResponse.json({ error: "The Institute Head or the Controller of Examinations sets these rules." }, { status: 403 });
      if (!GRADES.includes(String(b.transferMinGrade))) return NextResponse.json({ error: "Choose a grade." }, { status: 400 });
      const p = { transferMinGrade: String(b.transferMinGrade), transferMaxPct: Number(b.transferMaxPct), dropDeadlineWeek: Number(b.dropDeadlineWeek), readOnlyDays: Number(b.readOnlyDays) };
      await savePolicy(chairmanId, p, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "STUDENT_STATUS_RULES_SET", entityType: "StudentStatusPolicy", entityId: chairmanId, metadata: p }).catch(() => null);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? STATUS_HINT : m.slice(0, 300) }, { status: /does not exist|relation/i.test(m) ? 503 : 400 });
  }
}
