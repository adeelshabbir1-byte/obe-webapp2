import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { heldSet, packRoles } from "../../../../lib/dualRoles";

// Gives an existing teacher or Subject Expert an extra role - Dean, Chairman of a department, or Program Lead - or removes it.
// The person keeps their earlier roles and chooses which hat to wear when they sign in.
// The Institute Head can do all three; a Chairman can only name Program Leads inside their own department.
type Wanted = "DEAN" | "HEAD_OF_DEPARTMENT" | "DEPARTMENT_COORDINATOR" | "PROGRAM_LEAD";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "CHAIRMAN" && user.role !== "HEAD_OF_DEPARTMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const isInstituteHead = user.role === "CHAIRMAN";
  const chairmanId = isInstituteHead ? user.id : user.managedById || "";
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "choose a person" }, { status: 400 });

  // ---- remove a role ----
  // A teacher who was given the role simply goes back to being a teacher / Subject Expert.
  // A lead who is a real coordinator just stops leading. An account made only for the role (Chairman, Dean) is deleted.
  if (body.action === "REVOKE") {
    const holder = await prisma.user.findFirst({ where: { id: body.userId, managedById: chairmanId, OR: [{ role: { in: ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] } }, { secondaryRole: { in: ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] } }] } });
    if (!holder) return NextResponse.json({ error: "person not found" }, { status: 404 });
    if (!isInstituteHead && !(holder.role === "PROGRAM_COORDINATOR" && holder.departmentId === user.departmentId)) return NextResponse.json({ error: "you can only remove a Program Lead role in your own department" }, { status: 403 });

    // A person who holds several roles loses only the role that was asked for and keeps the rest.
    const heldNow = heldSet(holder);
    const LEADER = ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];
    if (body.role && LEADER.includes(body.role) && heldNow.includes(body.role) && heldNow.length > 1) {
      if (!isInstituteHead && !(body.role === "PROGRAM_COORDINATOR" && holder.departmentId === user.departmentId)) return NextResponse.json({ error: "you can only remove a Program Lead role in your own department" }, { status: 403 });
      const left = heldNow.filter((r) => r !== body.role);
      const packed = packRoles(left);
      const teachingOnly = packed.role === "SUBJECT_EXPERT" || packed.role === "INSTRUCTOR";
      if (body.role === "PROGRAM_COORDINATOR" && teachingOnly && (await prisma.batch.count({ where: { coordinatorId: holder.id } })) > 0) {
        return NextResponse.json({ error: "This person still owns batches and courses. Hand the program to a new Program Coordinator before removing the role." }, { status: 409 });
      }
      const manager = teachingOnly && holder.departmentId ? await prisma.user.findFirst({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: holder.departmentId, id: { not: holder.id } }, orderBy: { createdAt: "asc" } }) : null;
      await prisma.user.update({ where: { id: holder.id }, data: {
        ...packed,
        ...(body.role === "DEAN" || teachingOnly ? { facultyId: null } : {}),
        ...(body.role === "PROGRAM_COORDINATOR" || teachingOnly ? { leadProgram: null } : {}),
        ...(teachingOnly ? { managedById: manager?.id || chairmanId } : {}),
      } as never });
      await prisma.session.updateMany({ where: { userId: holder.id }, data: { activeRole: null } });
      await writeAuditLog({ actorUserId: user.id, action: "ROLE_REVOKED_KEEPING_OTHERS", entityType: "User", entityId: holder.id, metadata: { removed: body.role, kept: left.join(",") } });
      return NextResponse.json({ ok: true, result: "role removed, the other roles are kept" });
    }

    const hats = [holder.secondaryRole, holder.tertiaryRole];
    if (hats.includes("SUBJECT_EXPERT") || hats.includes("INSTRUCTOR")) {
      if (holder.role === "PROGRAM_COORDINATOR" && (await prisma.batch.count({ where: { coordinatorId: holder.id } })) > 0) {
        return NextResponse.json({ error: "This person still owns batches and courses. Hand the program to a new Program Coordinator before removing the role." }, { status: 409 });
      }
      const backTo = hats.includes("SUBJECT_EXPERT") ? "SUBJECT_EXPERT" : "INSTRUCTOR";
      const keepsTeaching = backTo === "SUBJECT_EXPERT" && hats.includes("INSTRUCTOR");
      const manager = holder.departmentId ? await prisma.user.findFirst({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: holder.departmentId, id: { not: holder.id } }, orderBy: { createdAt: "asc" } }) : null;
      await prisma.user.update({ where: { id: holder.id }, data: { role: backTo, secondaryRole: keepsTeaching ? "INSTRUCTOR" : null, tertiaryRole: null, extraRoles: [], leadProgram: null, facultyId: null, managedById: manager?.id || chairmanId } as never });
      await prisma.session.updateMany({ where: { userId: holder.id }, data: { activeRole: null } });
      await writeAuditLog({ actorUserId: user.id, action: "TEACHER_ROLE_REVOKED", entityType: "User", entityId: holder.id, metadata: { was: holder.role } });
      return NextResponse.json({ ok: true, result: "back to teacher" });
    }

    if (holder.role === "PROGRAM_COORDINATOR") {
      if (!holder.leadProgram) return NextResponse.json({ error: "this person is a Program Coordinator, not a Program Lead" }, { status: 400 });
      await prisma.user.update({ where: { id: holder.id }, data: { leadProgram: null } });
      await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_LEAD_CLEARED", entityType: "User", entityId: holder.id });
      return NextResponse.json({ ok: true, result: "no longer leads the program (still a coordinator)" });
    }

    // Chairman / Dean account created just for the role: delete it, unless it still holds courses.
    const [asInstructor, asSubjectExpert, sections] = await Promise.all([
      prisma.course.findMany({ where: { instructorId: holder.id }, select: { code: true } }),
      prisma.course.findMany({ where: { subjectExpertId: holder.id }, select: { code: true } }),
      prisma.courseSectionAssignment.findMany({ where: { instructorId: holder.id }, include: { course: true } }),
    ]);
    const blockers = [...asInstructor.map((c) => c.code), ...asSubjectExpert.map((c) => c.code), ...sections.map((x) => x.course.code)];
    if (blockers.length > 0) return NextResponse.json({ error: `Reassign these courses first: ${blockers.join(", ")}` }, { status: 409 });
    try {
      await prisma.$transaction([
        prisma.session.deleteMany({ where: { userId: holder.id } }),
        prisma.facultyUnavailability.deleteMany({ where: { facultyId: holder.id } }),
        prisma.scheduleSection.deleteMany({ where: { instructorId: holder.id } }),
        prisma.user.delete({ where: { id: holder.id } }),
      ]);
    } catch {
      // Something still points at this account (for example old audit entries). Switch it off instead of deleting.
      await prisma.user.update({ where: { id: holder.id }, data: { isActive: false, departmentId: null, facultyId: null, secondaryRole: null } });
      await writeAuditLog({ actorUserId: user.id, action: "ROLE_HOLDER_DEACTIVATED", entityType: "User", entityId: holder.id });
      return NextResponse.json({ ok: true, result: "account switched off" });
    }
    await writeAuditLog({ actorUserId: user.id, action: "ROLE_HOLDER_DELETED", entityType: "User", entityId: holder.id, metadata: { role: holder.role } });
    return NextResponse.json({ ok: true, result: "account deleted" });
  }

  // ---- give a role ----
  const wanted = body.role as Wanted;
  if (!["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_LEAD"].includes(wanted)) return NextResponse.json({ error: "choose a role" }, { status: 400 });
  if (!isInstituteHead && wanted !== "PROGRAM_LEAD") return NextResponse.json({ error: "only the Institute Head can name a Dean, a Chairman or a Program Coordinator" }, { status: 403 });

  const teacher = await prisma.user.findFirst({
    where: { id: body.userId, isVisitingPlaceholder: false, OR: [{ managedBy: { managedById: chairmanId } }, { managedById: chairmanId }], role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] } },
  });
  if (!teacher) return NextResponse.json({ error: "teacher not found" }, { status: 404 });
  // In a small university one person can hold every role at once: Dean, Chairman, Program Lead, Program Coordinator, Subject Expert, Instructor.
  // The role that owns data becomes the stored main role; all the others are kept as hats the person switches between.
  const target = wanted === "PROGRAM_LEAD" ? "PROGRAM_COORDINATOR" : wanted;
  const held = heldSet(teacher);
  if (held.includes(target) && !(target === "PROGRAM_COORDINATOR" && body.program && body.program !== teacher.leadProgram)) return NextResponse.json({ error: "This person already holds that role." }, { status: 409 });
  const teacherDept = teacher.departmentId || (teacher.managedById ? (await prisma.user.findUnique({ where: { id: teacher.managedById }, select: { departmentId: true } }))?.departmentId : null);
  if (!isInstituteHead && teacherDept !== user.departmentId) return NextResponse.json({ error: "you can only choose teachers from your own department" }, { status: 403 });
  const packed = packRoles(Array.from(new Set([...held, target])));
  const deptBound = held.some((r) => ["HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"].includes(r));
  const clash = (deptId: string) => deptBound && teacher.departmentId && teacher.departmentId !== deptId;
  const CLASH_MSG = "This person already holds a role in another department. One person can hold several roles, but they must all be in the same department.";

  if (wanted === "DEAN") {
    const faculty = body.facultyId ? await prisma.faculty.findFirst({ where: { id: body.facultyId, chairmanId } }) : null;
    if (!faculty) return NextResponse.json({ error: "choose a faculty" }, { status: 400 });
    await prisma.user.update({ where: { id: teacher.id }, data: { ...packed, facultyId: faculty.id, managedById: chairmanId } as never });
  } else if (wanted === "DEPARTMENT_COORDINATOR") {
    const dept = body.departmentId ? await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId } }) : null;
    if (!dept) return NextResponse.json({ error: "choose a department" }, { status: 400 });
    if (clash(dept.id)) return NextResponse.json({ error: CLASH_MSG }, { status: 409 });
    if ((await prisma.user.count({ where: { role: "DEPARTMENT_COORDINATOR", departmentId: dept.id, id: { not: teacher.id } } })) > 0) return NextResponse.json({ error: "this department already has a Program Coordinator - remove them first" }, { status: 409 });
    await prisma.user.update({ where: { id: teacher.id }, data: { ...packed, departmentId: dept.id, managedById: chairmanId } as never });
  } else if (wanted === "HEAD_OF_DEPARTMENT") {
    const dept = body.departmentId ? await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId } }) : null;
    if (!dept) return NextResponse.json({ error: "choose a department" }, { status: 400 });
    if (clash(dept.id)) return NextResponse.json({ error: CLASH_MSG }, { status: 409 });
    await prisma.user.update({ where: { id: teacher.id }, data: { ...packed, departmentId: dept.id, managedById: chairmanId } as never });
  } else {
    const program = typeof body.program === "string" ? body.program : "";
    const owner = program ? await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: program, ...(isInstituteHead ? {} : { departmentId: user.departmentId || "none" }) } }) : null;
    if (!owner) return NextResponse.json({ error: "choose one of the department's programs" }, { status: 400 });
    if (clash(owner.departmentId)) return NextResponse.json({ error: CLASH_MSG }, { status: 409 });
    // One lead per program: whoever led it before stops being its lead.
    await prisma.user.updateMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: owner.departmentId, leadProgram: program, id: { not: teacher.id } }, data: { leadProgram: null } });
    await prisma.user.update({ where: { id: teacher.id }, data: { ...packed, leadProgram: program, departmentId: owner.departmentId, managedById: chairmanId } as never });
  }
  await prisma.session.updateMany({ where: { userId: teacher.id }, data: { activeRole: null } });
  await writeAuditLog({ actorUserId: user.id, action: "TEACHER_ROLE_GIVEN", entityType: "User", entityId: teacher.id, metadata: { role: wanted, facultyId: body.facultyId || null, departmentId: body.departmentId || null, program: body.program || null } });
  return NextResponse.json({ ok: true });
}
