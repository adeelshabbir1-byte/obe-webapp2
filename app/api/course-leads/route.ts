import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { loadTeams, LEAD_MANAGER_ROLES } from "../../../lib/courseTeams";
import { courseScopeFor } from "../../../lib/reportScope";
import { writeAuditLog } from "../../../lib/audit";

// Names (or changes) the Course Lead of a course team. Changing the lead restarts any paper approval in progress.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !LEAD_MANAGER_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const body = await req.json().catch(() => ({}));
  if (!body.teamKey || !body.leadId) return NextResponse.json({ error: "teamKey and leadId are required" }, { status: 400 });

  const team = (await loadTeams(chairmanId)).find((t) => t.key === body.teamKey);
  if (!team) return NextResponse.json({ error: "course team not found" }, { status: 404 });
  const scope = user.role === "COURSE_ASSIGNER" ? { coordinator: { managedById: chairmanId } } : courseScopeFor(user);
  const visible = await prisma.course.count({ where: { id: { in: team.rows.map((r) => r.courseId) }, ...scope } });
  if (visible === 0) return NextResponse.json({ error: "course team not found" }, { status: 404 });
  if (!team.teachers.some((t) => t.id === body.leadId)) return NextResponse.json({ error: "the lead must be one of the teachers of this course" }, { status: 400 });

  await prisma.courseLead.upsert({
    where: { chairmanId_teamKey: { chairmanId, teamKey: team.key } },
    create: { chairmanId, teamKey: team.key, leadId: body.leadId, assignedById: user.id },
    update: { leadId: body.leadId, assignedById: user.id },
  });
  if (team.leadId && team.leadId !== body.leadId) await prisma.paperSubmission.deleteMany({ where: { chairmanId, teamKey: team.key } });
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_LEAD_SET", entityType: "Course", entityId: team.rows[0].courseId, metadata: { teamKey: team.key, leadId: body.leadId } });
  return NextResponse.json({ ok: true });
}
