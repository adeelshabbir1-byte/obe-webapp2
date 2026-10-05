import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { blockedAsNonBaseCourse, syncSubjectExpertToLinkedCourses } from "../../../../../lib/contentSync";

/** One-time catch-up for labs that already exist: every Lab "<CODE>-L" with
 * NO Subject Expert gets its theory course's expert. A Lab that already has
 * a DIFFERENT expert is never touched — it's listed back so the Coordinator
 * can decide. Send { apply: false } to preview without changing anything. */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const apply = body.apply !== false;

  const labs = await prisma.course.findMany({
    where: { coordinatorId: user.id, courseType: "Lab", code: { endsWith: "-L" } },
    include: { batch: true, subjectExpert: { select: { name: true } } },
  });
  const theories = await prisma.course.findMany({
    where: { coordinatorId: user.id, courseType: { not: "Lab" }, code: { in: labs.map((l) => l.code.slice(0, -2)) } },
    include: { subjectExpert: { select: { name: true } } },
  });
  const theoryByKey = new Map(theories.map((t) => [`${t.batchId}|${t.code}`, t]));

  const filled: string[] = [];
  const differing: string[] = [];
  const blocked: string[] = [];
  let theoryUnassigned = 0;
  for (const lab of labs) {
    const theory = theoryByKey.get(`${lab.batchId}|${lab.code.slice(0, -2)}`);
    if (!theory) continue;
    const where = `${lab.code}${lab.batch ? ` (${lab.batch.batchName})` : ""}`;
    if (!theory.subjectExpertId) { theoryUnassigned++; continue; }
    if (lab.subjectExpertId === theory.subjectExpertId) continue;
    if (lab.subjectExpertId) {
      differing.push(`${where}: lab has ${lab.subjectExpert?.name || "another expert"}, theory has ${theory.subjectExpert?.name || "another expert"}`);
      continue;
    }
    if (await blockedAsNonBaseCourse(lab.id)) { blocked.push(where); continue; }
    if (apply) {
      await prisma.course.update({ where: { id: lab.id }, data: { subjectExpertId: theory.subjectExpertId } });
      await syncSubjectExpertToLinkedCourses(lab.id, theory.subjectExpertId);
      await writeAuditLog({
        actorUserId: user.id, action: "SUBJECT_EXPERT_ASSIGNED", entityType: "Course", entityId: lab.id,
        metadata: { subjectExpertId: theory.subjectExpertId, via: "sync_lab_experts", theoryCourseId: theory.id },
      });
    }
    filled.push(`${where} → ${theory.subjectExpert?.name || ""}`);
  }
  return NextResponse.json({ applied: apply, filled, differing, blocked, theoryUnassigned });
}
