import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { setObeStart } from "../../../lib/obeTerm";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

const odb = prisma as unknown as Record<string, any>;

// POST { scope: "institute" | "program", program?, termName, termYear } (empty termYear clears) — the OBE start term.
// POST { scope: "course", courseId, off: boolean, reason } — the Program Lead marks one course offering grades-only.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const term = b.termYear ? { termName: b.termName === "Spring" ? "Spring" : "Fall", termYear: Math.round(Number(b.termYear)) } : null;
  if (term && (term.termYear < 2000 || term.termYear > 2100)) return NextResponse.json({ error: "Give a year like 2024." }, { status: 400 });
  try {
    if (b.scope === "institute") {
      if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "The Institute Head sets the institute's OBE start." }, { status: 403 });
      await setObeStart(user.id, "", term, user);
      return NextResponse.json({ ok: true, message: term ? `OBE from ${term.termName} ${term.termYear}: courses taught from then on are OBE; earlier ones are grades only.` : "Cleared — every course counts as OBE." });
    }
    if (b.scope === "program") {
      const program = String(b.program || "");
      let chairmanId = "";
      if (user.role === "CHAIRMAN") chairmanId = user.id;
      else if (user.role === "PROGRAM_COORDINATOR" && (await prisma.batch.count({ where: { coordinatorId: user.id, degreeProgram: program } }))) chairmanId = user.managedById || "";
      if (!chairmanId || !program) return NextResponse.json({ error: "Only the program's Program Lead (or the Institute Head) sets this." }, { status: 403 });
      await setObeStart(chairmanId, program, term, user);
      return NextResponse.json({ ok: true, message: term ? `${program}: OBE from ${term.termName} ${term.termYear}.` : `${program} follows the institute's OBE start.` });
    }
    if (b.scope === "course") {
      const c = await prisma.course.findFirst({ where: { id: String(b.courseId || ""), coordinatorId: user.id }, select: { id: true, code: true } });
      if (!c) return NextResponse.json({ error: "Only the course's Program Lead does this." }, { status: 403 });
      const reason = String(b.reason || "").trim().slice(0, 300);
      if (b.off) { if (!reason) return NextResponse.json({ error: "Say why this course is grades-only." }, { status: 400 }); await odb.obeCourseOff.upsert({ where: { courseId: c.id }, create: { courseId: c.id, reason, byId: user.id }, update: { reason, byId: user.id, at: new Date() } }); }
      else await odb.obeCourseOff.delete({ where: { courseId: c.id } }).catch(() => null);
      await writeAuditLog({ actorUserId: user.id, action: b.off ? "COURSE_GRADES_ONLY" : "COURSE_OBE_AGAIN", entityType: "Course", entityId: c.id, metadata: { reason } }).catch(() => null);
      return NextResponse.json({ ok: true, message: b.off ? `${c.code} is grades-only.` : `${c.code} is an OBE course again.` });
    }
    return NextResponse.json({ error: "unknown scope" }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? "Run prisma/migration_obe_start.sql (System Health → Run migrations)." : m.slice(0, 200) }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
