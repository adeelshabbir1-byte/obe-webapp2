import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { heldSet, packRoles } from "../../../../lib/dualRoles";

// The Institute Head edits one person on the "All Users and Roles" page: name, email, department, login on/off,
// and the teaching / staff roles. Leader roles (Dean, Chairman, Program Lead, Program Coordinator), OMC and Course
// Assigner are added and removed through their own endpoints, which already carry the safety checks.

const LEADERS = ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];
const DEPT_BOUND = ["HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];
const TEACHING = ["SUBJECT_EXPERT", "INSTRUCTOR"];
const STAFF = ["LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER"];

export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const person = await prisma.user.findFirst({
    where: { id: String(b.userId || ""), isVisitingPlaceholder: false, OR: [{ managedById: user.id }, { managedBy: { managedById: user.id } }] },
  });
  if (!person || person.role === "CHAIRMAN") return NextResponse.json({ error: "person not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  const changes: string[] = [];

  // ---- name, email, login on/off ----
  if (typeof b.name === "string" && b.name.trim() !== person.name) {
    if (!b.name.trim()) return NextResponse.json({ error: "the name cannot be empty" }, { status: 400 });
    data.name = b.name.trim(); changes.push("name");
  }
  if (typeof b.email === "string" && b.email.trim().toLowerCase() !== person.email.toLowerCase()) {
    const email = b.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "that email address does not look right" }, { status: 400 });
    if (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: person.id } } })) return NextResponse.json({ error: "that email is already used by another account" }, { status: 409 });
    data.email = email; changes.push("email");
  }
  if (typeof b.isActive === "boolean" && b.isActive !== person.isActive) { data.isActive = b.isActive; changes.push(b.isActive ? "switched on" : "switched off"); }

  // ---- roles ----
  const held = heldSet(person);
  const leaders = held.filter((r) => LEADERS.includes(r));
  let newRoles: { role: string; secondaryRole: string | null; tertiaryRole: string | null; extraRoles: string[] } | null = null;
  if (Array.isArray(b.roles)) {
    const wanted = Array.from(new Set((b.roles as string[]).filter((r) => typeof r === "string")));
    const isStaff = STAFF.includes(person.role);
    const isLabEng = person.role === "LAB_ENGINEER";
    if (isStaff) {
      // Office staff switch between staff roles only (one role each).
      if (wanted.length !== 1 || !STAFF.includes(wanted[0])) return NextResponse.json({ error: "choose one staff role (Lab Manager, Librarian, Finance Officer or Student Affairs)" }, { status: 400 });
      if (wanted[0] !== person.role) newRoles = { role: wanted[0], secondaryRole: null, tertiaryRole: null, extraRoles: [] };
    } else {
      const teach = wanted.filter((r) => TEACHING.includes(r) || r === "LAB_ENGINEER");
      if (wanted.some((r) => STAFF.includes(r))) return NextResponse.json({ error: "a teacher cannot be turned into office staff here - create a separate staff login" }, { status: 400 });
      if (teach.includes("LAB_ENGINEER") && (teach.length > 1 || leaders.length)) return NextResponse.json({ error: "Lab Engineer is a role on its own; untick Subject Expert / Instructor, and remove any leader role first" }, { status: 400 });
      if (!teach.length && !leaders.length) return NextResponse.json({ error: "a person needs at least one role" }, { status: 400 });
      const before = held.filter((r) => TEACHING.includes(r) || r === "LAB_ENGINEER").sort().join(",");
      if (teach.slice().sort().join(",") !== before) {
        newRoles = teach.includes("LAB_ENGINEER") ? { role: "LAB_ENGINEER", secondaryRole: null, tertiaryRole: null, extraRoles: [] } : (packRoles([...leaders, ...teach]) as never);
        if (isLabEng && !teach.includes("LAB_ENGINEER")) changes.push("no longer Lab Engineer");
      }
    }
    if (newRoles) {
      // Do not take away a role the person still has work under.
      const after = heldSet(newRoles);
      const lost = held.filter((r) => !after.includes(r));
      const blockers: string[] = [];
      if (lost.includes("SUBJECT_EXPERT")) blockers.push(...(await prisma.course.findMany({ where: { subjectExpertId: person.id }, select: { code: true } })).map((c) => `${c.code} (Subject Expert)`));
      if (lost.includes("INSTRUCTOR")) {
        const [a, s] = await Promise.all([
          prisma.course.findMany({ where: { instructorId: person.id }, select: { code: true } }),
          prisma.courseSectionAssignment.findMany({ where: { instructorId: person.id }, select: { course: { select: { code: true } } } }),
        ]);
        blockers.push(...a.map((c) => `${c.code} (instructor)`), ...s.map((x) => `${x.course.code} (section)`));
      }
      if (lost.includes("LAB_ENGINEER")) blockers.push(...(await prisma.course.findMany({ where: { labEngineerId: person.id }, select: { code: true } })).map((c) => `${c.code} (lab)`));
      if (blockers.length) return NextResponse.json({ error: `Reassign these courses before removing that role: ${Array.from(new Set(blockers)).slice(0, 15).join(", ")}` }, { status: 409 });
      Object.assign(data, newRoles);
      changes.push(`roles: ${after.join(" + ")}`);
    }
  }

  // ---- department ----
  if (b.departmentId !== undefined && (b.departmentId || null) !== (person.departmentId || null)) {
    const deptId = b.departmentId ? String(b.departmentId) : null;
    if (deptId && !(await prisma.department.findFirst({ where: { id: deptId, chairmanId: user.id } }))) return NextResponse.json({ error: "choose one of your departments" }, { status: 400 });
    const bound = held.filter((r) => DEPT_BOUND.includes(r));
    if (bound.length) return NextResponse.json({ error: "This person leads in their department (Chairman / Program Lead / Program Coordinator). Remove that role first, then move them." }, { status: 409 });
    data.departmentId = deptId;
    // A teacher is listed under a Program Lead of their department; move them to one in the new department.
    const roleNow = (data.role as string) || person.role;
    if (deptId && [...TEACHING, "LAB_ENGINEER"].includes(roleNow)) {
      const lead = await prisma.user.findFirst({ where: { role: "PROGRAM_COORDINATOR", managedById: user.id, departmentId: deptId }, orderBy: { createdAt: "asc" } });
      if (lead) data.managedById = lead.id;
    }
    changes.push("department");
  }

  if (!changes.length) return NextResponse.json({ ok: true, result: "nothing changed" });
  await prisma.user.update({ where: { id: person.id }, data: data as never });
  if (data.isActive === false) await prisma.session.deleteMany({ where: { userId: person.id } });
  else if (newRoles) await prisma.session.updateMany({ where: { userId: person.id }, data: { activeRole: null } });
  await writeAuditLog({ actorUserId: user.id, action: "PERSON_EDITED", entityType: "User", entityId: person.id, metadata: { changes: changes.join("; ") } });
  return NextResponse.json({ ok: true, result: changes.join(", ") });
}
