import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { saveScheme, applyCodes, CODES_HINT } from "../../../lib/courseCodes";
import { withErrors } from "../../../lib/apiHandler";

// POST { action: "scheme", departmentId, prefix, digits, separator, program?, effectiveTerm?, effectiveYear?, id? } — Dean / Institute Head
// POST { action: "apply", batchId, picks: [{ courseId, code }] } — the batch's Program Lead (or OMC)
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cid = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  try {
    if (b.action === "scheme") {
      if (!["CHAIRMAN", "DEAN"].includes(user.role)) return NextResponse.json({ error: "The Dean (or the Institute Head) decides the course-code system." }, { status: 403 });
      const d = await prisma.department.findFirst({ where: { id: String(b.departmentId || ""), chairmanId: cid }, select: { id: true, facultyId: true } });
      if (!d) return NextResponse.json({ error: "Choose a department." }, { status: 400 });
      if (user.role === "DEAN" && d.facultyId && d.facultyId !== (user as { facultyId?: string | null }).facultyId) return NextResponse.json({ error: "That department is not in your faculty." }, { status: 403 });
      await saveScheme(cid, user.id, { id: b.id ? String(b.id) : undefined, departmentId: d.id, program: b.program ? String(b.program) : null, prefix: String(b.prefix || ""), digits: Number(b.digits) || 4, separator: String(b.separator ?? ""), effectiveTerm: b.effectiveTerm ? String(b.effectiveTerm) : null, effectiveYear: Number(b.effectiveYear) || null });
      return NextResponse.json({ ok: true, message: "Saved. Program Leads see the new codes for their batches under Course Codes." });
    }
    if (b.action === "apply") {
      const batch = await prisma.batch.findUnique({ where: { id: String(b.batchId || "") }, select: { coordinatorId: true, coordinator: { select: { managedById: true } } } });
      if (!batch || !(batch.coordinatorId === user.id || (["OMC", "CHAIRMAN"].includes(user.role) && batch.coordinator.managedById === cid))) return NextResponse.json({ error: "Only the batch's Program Lead (or the OMC) applies codes." }, { status: 403 });
      const r = await applyCodes(user.id, String(b.batchId), Array.isArray(b.picks) ? b.picks : []);
      return NextResponse.json({ ok: true, message: `${r.n} code(s) changed.${r.skipped.length ? ` Not changed: ${r.skipped.slice(0, 3).join("; ")}` : ""}` });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /courseCodeScheme|does not exist/.test(m) ? CODES_HINT : m }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
