import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";

// Where the change-request banner reads its state.
export async function GET(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const latest = await prisma.templateChangeRequest.findFirst({ where: { courseId: course.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    status: course.templateStatus,
    request: latest ? { id: latest.id, status: latest.status, reason: latest.reason, omcComment: latest.omcComment } : null,
  });
}

// The SE asks the OMC to reopen an approved template.
export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (course.templateStatus !== "approved") return NextResponse.json({ error: "Only an approved template needs a change request." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  if (reason.length < 10) return NextResponse.json({ error: "Please explain what you want to change and why (at least a sentence)." }, { status: 400 });

  const open = await prisma.templateChangeRequest.findFirst({ where: { courseId: course.id, status: "pending" } });
  if (open) return NextResponse.json({ error: "A change request is already waiting for the OMC." }, { status: 400 });

  const c = course as unknown as { offeredTermName: string | null; offeredTermYear: number | null };
  const termLabel = [c.offeredTermName, c.offeredTermYear].filter(Boolean).join(" ") || null;
  const request = await prisma.templateChangeRequest.create({ data: { courseId: course.id, requestedById: user.id, reason, termLabel } });
  await writeAuditLog({ actorUserId: user.id, action: "TEMPLATE_CHANGE_REQUESTED", entityType: "Course", entityId: course.id, metadata: { reason } });
  return NextResponse.json({ request: { id: request.id, status: request.status } }, { status: 201 });
}
