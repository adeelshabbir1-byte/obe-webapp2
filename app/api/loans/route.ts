import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { deptScope } from "../../../lib/omcScope";
import { lendableWhere, REQUEST_ROLES, LoanKind } from "../../../lib/loans";
import { writeAuditLog } from "../../../lib/audit";

const ALL_ROLES = Array.from(new Set<string>([...REQUEST_ROLES.INSTRUCTOR, ...REQUEST_ROLES.SUBJECT_EXPERT]));

async function chairmanOf(user: { id: string; role: string; managedById: string | null }) {
  return user.role === "COURSE_ASSIGNER" ? user.managedById || "" : chairmanIdFor(user);
}
const kindsFor = (role: string): LoanKind[] => (["INSTRUCTOR", "SUBJECT_EXPERT"] as LoanKind[]).filter((k) => REQUEST_ROLES[k].includes(role));

// Everything the "Faculty from other departments" page needs: my courses, who can be asked, and my requests.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALL_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanOf(user);
  const kinds = kindsFor(user.role);

  const coordinatorWhere = {
    role: "PROGRAM_COORDINATOR" as const, managedById: chairmanId,
    ...(user.role === "HEAD_OF_DEPARTMENT" || user.role === "PROGRAM_LEAD" ? { departmentId: user.departmentId || "none" } : {}), ...deptScope(user),
  };
  const coordinators = await prisma.user.findMany({ where: coordinatorWhere, select: { id: true, departmentId: true } });
  const deptOfCoordinator = new Map<string, string | null>(coordinators.map((c: { id: string; departmentId: string | null }) => [c.id, c.departmentId]));

  const [courses, departments, teachers, requests] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinators.map((c: { id: string }) => c.id) }, isOffered: true, ...(user.role === "PROGRAM_LEAD" ? { batch: { degreeProgram: user.leadProgram || "none" } } : {}) },
      select: { id: true, code: true, title: true, coordinatorId: true, instructor: { select: { name: true } }, subjectExpert: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.department.findMany({ where: { chairmanId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: lendableWhere(chairmanId, "INSTRUCTOR"), select: { id: true, name: true, role: true, departmentId: true }, orderBy: { name: "asc" } }),
    prisma.teacherLoanRequest.findMany({
      where: { chairmanId, kind: { in: kinds }, ...(user.role === "HEAD_OF_DEPARTMENT" || user.role === "PROGRAM_LEAD" ? { requestingDepartmentId: user.departmentId || "none" } : {}) },
      include: {
        course: { select: { code: true, title: true, instructorId: true, subjectExpertId: true, instructorResponse: true, instructorResponseNote: true, seResponse: true, seResponseNote: true } },
        instructor: { select: { name: true } }, lendingDepartment: { select: { name: true } }, requestingDepartment: { select: { name: true } },
        allowed: { include: { instructor: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);

  return NextResponse.json({
    kinds,
    courses: courses.map((c: any) => ({
      id: c.id, code: c.code, title: c.title, currentTeacher: c.instructor?.name || null, currentExpert: c.subjectExpert?.name || null,
      batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", departmentId: deptOfCoordinator.get(c.coordinatorId) || null,
    })),
    departments: departments.map((d: any) => ({ id: d.id, name: d.name })),
    teachers,
    requests: requests.map((r: any) => {
      const isSe = r.kind === "SUBJECT_EXPERT";
      const currentId: string | null = isSe ? r.course.subjectExpertId : r.course.instructorId;
      return {
        id: r.id, kind: r.kind, status: r.status, course: `${r.course.code} — ${r.course.title}`, asked: r.instructor?.name || null,
        from: r.lendingDepartment.name, for: r.requestingDepartment.name, note: r.note, decisionNote: r.decisionNote, createdAt: r.createdAt,
        allowed: r.allowed.map((a: any) => ({ id: a.instructorId, name: a.instructor.name })),
        assignedTo: r.allowed.find((a: any) => a.instructorId === currentId)?.name || null,
        response: isSe ? r.course.seResponse : r.course.instructorResponse,
        responseNote: isSe ? r.course.seResponseNote : r.course.instructorResponseNote,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALL_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanOf(user);
  const body = await req.json().catch(() => ({}));
  const kind: LoanKind = body.kind === "SUBJECT_EXPERT" ? "SUBJECT_EXPERT" : "INSTRUCTOR";
  if (!REQUEST_ROLES[kind].includes(user.role)) return NextResponse.json({ error: kind === "SUBJECT_EXPERT" ? "only the OMC can ask for a Subject Expert" : "only a Course Assigner can ask for a teacher" }, { status: 403 });
  if (!body.courseId || !body.lendingDepartmentId) return NextResponse.json({ error: "courseId and lendingDepartmentId are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;

  const course = await prisma.course.findFirst({ where: { id: body.courseId, isOffered: true, coordinator: { managedById: chairmanId, ...deptScope(user) }, ...(user.role === "PROGRAM_LEAD" ? { batch: { degreeProgram: user.leadProgram || "none" } } : {}) }, include: { coordinator: true } });
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });
  const requestingDepartmentId = course.coordinator.departmentId;
  if (!requestingDepartmentId) return NextResponse.json({ error: "this course's coordinator is not in a department yet" }, { status: 400 });
  if ((user.role === "HEAD_OF_DEPARTMENT" || user.role === "PROGRAM_LEAD") && user.departmentId !== requestingDepartmentId) return NextResponse.json({ error: "course not found" }, { status: 404 });

  const lending = await prisma.department.findFirst({ where: { id: body.lendingDepartmentId, chairmanId } });
  if (!lending) return NextResponse.json({ error: "department not found" }, { status: 404 });
  if (lending.id === requestingDepartmentId) return NextResponse.json({ error: "choose a different department - this course is already in that one" }, { status: 400 });

  // Optional: ask for one named person. Leave empty to ask for "any suitable person" and let the lending head choose.
  let instructorId: string | null = null;
  if (body.instructorId) {
    const teacher = await prisma.user.findFirst({ where: { id: body.instructorId, ...lendableWhere(chairmanId, kind, lending.id) } });
    if (!teacher) return NextResponse.json({ error: "that person cannot be asked for - pick someone from the lending department" }, { status: 404 });
    instructorId = teacher.id;
  }

  const dup = await prisma.teacherLoanRequest.findFirst({ where: { courseId: course.id, kind, lendingDepartmentId: lending.id, status: { in: ["PENDING", "APPROVED"] }, instructorId } });
  if (dup) return NextResponse.json({ error: "this request already exists" }, { status: 409 });

  const heads = await prisma.user.count({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: lending.id } });
  const loan = await prisma.teacherLoanRequest.create({
    data: { chairmanId, courseId: course.id, kind, instructorId, requestingDepartmentId, lendingDepartmentId: lending.id, requestedById: user.id, note, status: heads === 0 ? "APPROVED" : "PENDING", ...(heads === 0 ? { decidedAt: new Date(), decisionNote: "That department has no head - everyone suitable was allowed automatically" } : {}) },
  });
  if (heads === 0) {
    const people = instructorId ? [{ id: instructorId }] : await prisma.user.findMany({ where: lendableWhere(chairmanId, kind, lending.id), select: { id: true } });
    if (people.length > 0) await prisma.teacherLoanAllowed.createMany({ data: people.map((p: { id: string }) => ({ loanId: loan.id, instructorId: p.id })), skipDuplicates: true });
  }
  await writeAuditLog({ actorUserId: user.id, action: "TEACHER_LOAN_REQUESTED", entityType: "Course", entityId: course.id, metadata: { loanId: loan.id, kind, instructorId: instructorId || "any" } });
  return NextResponse.json({ loan, autoApproved: heads === 0 }, { status: 201 });
}

// Requester withdraws a still-waiting request.
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALL_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanOf(user);
  const id = new URL(req.url).searchParams.get("id") || "";
  const loan = await prisma.teacherLoanRequest.findFirst({ where: { id, chairmanId, status: "PENDING", kind: { in: kindsFor(user.role) } } });
  if (!loan) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.teacherLoanRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date(), decidedById: user.id } });
  return NextResponse.json({ ok: true });
}
