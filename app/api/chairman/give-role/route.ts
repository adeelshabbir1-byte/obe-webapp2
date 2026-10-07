import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Gives an existing teacher or Subject Expert an extra role - Dean, Chairman of a department, or Program Lead - or removes it.
// The person keeps their earlier roles and chooses which hat to wear when they sign in.
// The Institute Head can do all three; a Chairman can only name Program Leads inside their own department.
type Wanted = "DEAN" | "HEAD_OF_DEPARTMENT" | "PROGRAM_LEAD";

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
    const holder = await prisma.user.findFirst({ where: { id: body.userId, role: { in: ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"] }, managedById: chairmanId } });
    if (!holder) return NextResponse.json({ error: "person not found" }, { status: 404 });
    if (!isInstituteHead && !(holder.role === "PROGRAM_COORDINATOR" && holder.departmentId === user.departmentId)) return NextResponse.json({ error: "you can only remove a Program Lead role in your own department" }, { status: 403 });

    const hats = [holder.secondaryRole, holder.tertiaryRole];
    if (hats.includes("SUBJECT_EXPERT") || hats.includes("INSTRUCTOR")) {
      const backTo = hats.includes("SUBJECT_EXPERT") ? "SUBJECT_EXPERT" : "INSTRUCTOR";
      const keepsTeaching = backTo === "SUBJECT_EXPERT" && hats.includes("INSTRUCTOR");
      const manager = holder.departmentId ? await prisma.user.findFirst({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: holder.departmentId, id: { not: holder.id } }, orderBy: { createdAt: "asc" } }) : null;
      await prisma.user.update({ where: { id: holder.id }, data: { role: backTo, secondaryRole: keepsTeaching ? "INSTRUCTOR" : null, tertiaryRole: null, leadProgram: null, facultyId: null, managedById: manager?.id || chairmanId } });
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
  if (!["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_LEAD"].includes(wanted)) return NextResponse.json({ error: "choose a role" }, { status: 400 });
  if (!isInstituteHead && wanted !== "PROGRAM_LEAD") return NextResponse.json({ error: "only the Institute Head can name a Dean or a Chairman" }, { status: 403 });

  const teacher = await prisma.user.findFirst({
    where: { id: body.userId, isVisitingPlaceholder: false, OR: [{ managedBy: { managedById: chairmanId } }, { managedById: chairmanId }], role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } },
  });
  if (!teacher) return NextResponse.json({ error: "teacher not found" }, { status: 404 });
  // Their earlier roles stay available as extra hats: Instructor -> [Instructor]; Subject Expert -> [Subject Expert] or [Subject Expert, Instructor].
  const wasSe = teacher.role === "SUBJECT_EXPERT";
  const hats = wasSe ? { secondaryRole: "SUBJECT_EXPERT", tertiaryRole: teacher.secondaryRole === "INSTRUCTOR" ? "INSTRUCTOR" : null } : { secondaryRole: "INSTRUCTOR", tertiaryRole: null };
  if (!isInstituteHead && teacher.departmentId !== user.departmentId) return NextResponse.json({ error: "you can only choose teachers from your own department" }, { status: 403 });

  if (wanted === "DEAN") {
    const faculty = body.facultyId ? await prisma.faculty.findFirst({ where: { id: body.facultyId, chairmanId } }) : null;
    if (!faculty) return NextResponse.json({ error: "choose a faculty" }, { status: 400 });
    await prisma.user.update({ where: { id: teacher.id }, data: { role: "DEAN", ...hats, facultyId: faculty.id, managedById: chairmanId } });
  } else if (wanted === "HEAD_OF_DEPARTMENT") {
    const dept = body.departmentId ? await prisma.department.findFirst({ where: { id: body.departmentId, chairmanId } }) : null;
    if (!dept) return NextResponse.json({ error: "choose a department" }, { status: 400 });
    await prisma.user.update({ where: { id: teacher.id }, data: { role: "HEAD_OF_DEPARTMENT", ...hats, departmentId: dept.id, managedById: chairmanId } });
  } else {
    const program = typeof body.program === "string" ? body.program : "";
    const owner = program ? await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: program, ...(isInstituteHead ? {} : { departmentId: user.departmentId || "none" }) } }) : null;
    if (!owner) return NextResponse.json({ error: "choose one of the department's programs" }, { status: 400 });
    // One lead per program: whoever led it before stops being its lead.
    await prisma.user.updateMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: owner.departmentId, leadProgram: program, id: { not: teacher.id } }, data: { leadProgram: null } });
    await prisma.user.update({ where: { id: teacher.id }, data: { role: "PROGRAM_COORDINATOR", ...hats, leadProgram: program, departmentId: owner.departmentId, managedById: chairmanId } });
  }
  await prisma.session.updateMany({ where: { userId: teacher.id }, data: { activeRole: null } });
  await writeAuditLog({ actorUserId: user.id, action: "TEACHER_ROLE_GIVEN", entityType: "User", entityId: teacher.id, metadata: { role: wanted, facultyId: body.facultyId || null, departmentId: body.departmentId || null, program: body.program || null } });
  return NextResponse.json({ ok: true });
}
