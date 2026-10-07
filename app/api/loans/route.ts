import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { isHeadFaculty } from "../../../lib/departments";
import { applyLoan } from "../../../lib/loans";
import { writeAuditLog } from "../../../lib/audit";

const ROLES = ["COURSE_ASSIGNER", "HEAD_OF_DEPARTMENT", "CHAIRMAN"];

async function chairmanOf(user: { id: string; role: string; managedById: string | null }) {
  return user.role === "COURSE_ASSIGNER" ? user.managedById || "" : chairmanIdFor(user);
}

// Everything the borrow page needs: my courses (not yet taught by a borrowed teacher), teachers in other departments, my requests.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanOf(user);

  const coordinatorWhere = { role: "PROGRAM_COORDINATOR" as const, managedById: chairmanId, ...(user.role === "HEAD_OF_DEPARTMENT" ? { departmentId: user.departmentId || "none" } : {}) };
  const coordinators = await prisma.user.findMany({ where: coordinatorWhere, select: { id: true, departmentId: true } });
  const deptOfCoordinator = new Map<string, string | null>(coordinators.map((c: { id: string; departmentId: string | null }) => [c.id, c.departmentId]));

  const [courses, departments, teachers, requests] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinators.map((c: { id: string }) => c.id) }, isOffered: true },
      select: { id: true, code: true, title: true, coordinatorId: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.department.findMany({ where: { chairmanId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { isVisitingPlaceholder: false, departmentId: { not: null }, OR: [{ role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, managedBy: { managedById: chairmanId } }, { role: "HEAD_OF_DEPARTMENT", secondaryRole: "INSTRUCTOR", managedById: chairmanId }] },
      select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" },
    }),
    prisma.teacherLoanRequest.findMany({
      where: { chairmanId, ...(user.role === "HEAD_OF_DEPARTMENT" ? { requestingDepartmentId: user.departmentId || "none" } : {}) },
      include: { course: { select: { code: true, title: true } }, instructor: { select: { name: true } }, lendingDepartment: { select: { name: true } }, requestingDepartment: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);

  return NextResponse.json({
    courses: courses.map((c: any) => ({
      id: c.id, code: c.code, title: c.title, current: c.instructor?.name || null,
      batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", departmentId: deptOfCoordinator.get(c.coordinatorId) || null,
    })),
    departments: departments.map((d: any) => ({ id: d.id, name: d.name })),
    teachers,
    requests: requests.map((r: any) => ({
      id: r.id, status: r.status, course: `${r.course.code} — ${r.course.title}`, teacher: r.instructor.name,
      from: r.lendingDepartment.name, for: r.requestingDepartment.name, note: r.note, decisionNote: r.decisionNote, createdAt: r.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanOf(user);
  const body = await req.json().catch(() => ({}));
  if (!body.courseId || !body.instructorId) return NextResponse.json({ error: "courseId and instructorId are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;

  const course = await prisma.course.findFirst({ where: { id: body.courseId, isOffered: true, coordinator: { managedById: chairmanId } }, include: { coordinator: true } });
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });
  const requestingDepartmentId = course.coordinator.departmentId;
  if (!requestingDepartmentId) return NextResponse.json({ error: "this course's coordinator is not in a department yet" }, { status: 400 });
  if (user.role === "HEAD_OF_DEPARTMENT" && user.departmentId !== requestingDepartmentId) return NextResponse.json({ error: "course not found" }, { status: 404 });

  const teacher = await prisma.user.findUnique({ where: { id: body.instructorId }, include: { managedBy: true } });
  if (!teacher || teacher.isVisitingPlaceholder || !(isHeadFaculty(teacher, chairmanId) || (["INSTRUCTOR", "SUBJECT_EXPERT"].includes(teacher.role) && teacher.managedBy?.managedById === chairmanId))) {
    return NextResponse.json({ error: "teacher not found" }, { status: 404 });
  }
  const lendingDepartmentId = teacher.departmentId;
  if (!lendingDepartmentId) return NextResponse.json({ error: "that teacher is not in a department yet" }, { status: 400 });
  if (lendingDepartmentId === requestingDepartmentId) return NextResponse.json({ error: "that teacher is already in this course's department - assign directly instead" }, { status: 400 });

  const dup = await prisma.teacherLoanRequest.findFirst({ where: { courseId: course.id, instructorId: teacher.id, status: "PENDING" } });
  if (dup) return NextResponse.json({ error: "a request for this teacher and course is already waiting" }, { status: 409 });

  const heads = await prisma.user.count({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: lendingDepartmentId } });
  const loan = await prisma.teacherLoanRequest.create({
    data: { chairmanId, courseId: course.id, instructorId: teacher.id, requestingDepartmentId, lendingDepartmentId, requestedById: user.id, note, status: heads === 0 ? "APPROVED" : "PENDING", ...(heads === 0 ? { decidedAt: new Date(), decisionNote: "Lending department has no head - approved automatically" } : {}) },
  });
  if (heads === 0) await applyLoan(loan.id, user.id);
  await writeAuditLog({ actorUserId: user.id, action: "TEACHER_LOAN_REQUESTED", entityType: "Course", entityId: course.id, metadata: { instructorId: teacher.id, loanId: loan.id } });
  return NextResponse.json({ loan, autoApproved: heads === 0 }, { status: 201 });
}

// Requester withdraws a still-waiting request.
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanOf(user);
  const id = new URL(req.url).searchParams.get("id") || "";
  const loan = await prisma.teacherLoanRequest.findFirst({ where: { id, chairmanId, status: "PENDING" } });
  if (!loan) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.teacherLoanRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date(), decidedById: user.id } });
  return NextResponse.json({ ok: true });
}
