import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { rfdb, flagCapacity, FLAG_ROLE } from "../../../lib/remediationFlags";
import { remediationScope } from "../../../lib/remediation";
import { notifyUsers } from "../../../lib/notifications";

// Flag students for remediation on topics of a course (advisor, the course's teacher, the next course's teacher, OMC,
// Program Lead / Chairman), or — for planners — dismiss a flag.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "flag") {
      const course = await prisma.course.findUnique({ where: { id: String(b.courseId || "") }, select: { id: true, code: true, title: true, coordinatorId: true } });
      const topics: string[] = (Array.isArray(b.topics) ? b.topics : []).filter((x: unknown) => typeof x === "string" && x.trim()).map((x: string) => x.slice(0, 200)).slice(0, 30);
      const sids: string[] = (Array.isArray(b.studentIds) ? b.studentIds : []).filter((x: unknown) => typeof x === "string").slice(0, 300);
      if (!course || !topics.length || !sids.length) return NextResponse.json({ error: "Choose the students and the topics." }, { status: 400 });
      const cid = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
      let n = 0; const refused: string[] = [];
      for (const sid of sids) {
        const as = await flagCapacity(user, sid, course.id);
        if (!as) { refused.push(sid); continue; }
        await rfdb.remediationFlag.create({ data: { chairmanId: cid, studentId: sid, courseId: course.id, courseCode: course.code, topicsJson: JSON.stringify(topics), reason: typeof b.reason === "string" ? b.reason.slice(0, 1000) : null, flaggedById: user.id, flaggedAs: as } });
        n++;
      }
      if (n) {
        // Planners of that program hear about it: its Program Lead and the institute's OMC.
        const omc = await prisma.user.findMany({ where: { managedById: cid, isActive: true, OR: [{ role: "OMC" as never }, { omcHat: true }] }, select: { id: true } });
        await notifyUsers([course.coordinatorId, ...omc.map((o) => o.id)], { kind: "REMEDIATION", title: `${n} student(s) flagged for remediation: ${course.code}`, body: `${topics.join(", ")} — flagged by ${user.name}`, href: "/remediation-flags", exceptId: user.id });
      }
      return NextResponse.json({ ok: true, flagged: n, refused: refused.length });
    }
    if (b.action === "dismiss" || b.action === "withdraw") {
      const f = (await rfdb.remediationFlag.findUnique({ where: { id: String(b.id || "") } })) as { id: string; chairmanId: string; flaggedById: string; status: string } | null;
      if (!f || f.status !== "OPEN") return NextResponse.json({ error: "not found" }, { status: 404 });
      const scope = await remediationScope(user);
      if (!(f.flaggedById === user.id || (scope.canPlan && scope.chairmanId === f.chairmanId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      await rfdb.remediationFlag.update({ where: { id: f.id }, data: { status: "DISMISSED" } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_remediation_flags.sql first." }, { status: 500 }); }
}
void FLAG_ROLE;
