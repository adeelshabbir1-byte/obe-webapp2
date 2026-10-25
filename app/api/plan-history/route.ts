import { NextRequest, NextResponse } from "next/server";
import { schemeAccess } from "../../../lib/degreeScheme";
import { addComment, hdb, REASONS } from "../../../lib/planHistory";

// POST { action: comment | reason, studentId?, body?, moveId?, reason?, note? } — the student or their advisor / Program Lead.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const access = await schemeAccess(b.studentId ? String(b.studentId) : null);
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  try {
    if (b.action === "comment") { await addComment(access.studentId, access.actorId, access.by === "student", String(b.body || b.note || ""), b.courseId ? String(b.courseId) : null); return NextResponse.json({ ok: true, message: "Comment added." }); }
    if (b.action === "reason") {
      const m = await hdb.planMove.findFirst({ where: { id: String(b.moveId || ""), studentId: access.studentId } });
      if (!m) throw new Error("Not found.");
      await hdb.planMove.update({ where: { id: m.id }, data: { reason: REASONS.some(([k]) => k === b.reason) ? b.reason : "OTHER", note: String(b.note || "").slice(0, 500) || m.note } });
      return NextResponse.json({ ok: true, message: "Reason saved." });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { const m = (e as Error).message; return NextResponse.json({ error: /does not exist|relation/.test(m) ? "Run the latest migration (System Health)." : m }, { status: 400 }); }
}
