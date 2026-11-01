import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";
import { collegeRoleBlock } from "../../../../lib/affiliates";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const faculty = await prisma.user.findMany({
    where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER"] }, managedById: user.id },
    orderBy: { createdAt: "desc" },
  });
  // The faculty type (Permanent / Shared / Visiting) shown beside each teacher.
  const types = new Map((await prisma.facultyProfile.findMany({ where: { userId: { in: faculty.map((f) => f.id) } }, select: { userId: true, employmentType: true } })).map((p) => [p.userId, p.employmentType]));
  return NextResponse.json({ faculty: faculty.map(({ passwordHash, ...u }) => ({ ...u, facultyType: types.get(u.id) || null })) });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.username || !body.password || !body.name || !body.email || !body.role) {
    return NextResponse.json({ error: "name, email, username, password, role are required" }, { status: 400 });
  }
  { const no = await collegeRoleBlock(user.managedById, body.role); if (no) return NextResponse.json({ error: no }, { status: 409 }); }
  // Teachers: the faculty type is required (Permanent: ours · Shared: borrowed from another department · Visiting).
  const facultyType = ["Permanent", "Shared", "Visiting"].includes(String(body.facultyType)) ? String(body.facultyType) : null;
  if (["SUBJECT_EXPERT", "INSTRUCTOR"].includes(body.role) && !facultyType) return NextResponse.json({ error: "Choose the faculty type: Permanent, Shared or Visiting." }, { status: 400 });
  if (!["SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "LAB_MANAGER"].includes(body.role)) {
    return NextResponse.json({ error: "role must be SUBJECT_EXPERT, INSTRUCTOR, LAB_ENGINEER or LAB_MANAGER" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }] } });
  if (existing) {
    return NextResponse.json({ error: "username or email already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.user.create({
    data: {
      email: body.email,
      username: body.username,
      passwordHash,
      name: body.name,
      role: body.role,
      managedById: user.id,
      departmentId: user.departmentId,
      mustChangePassword: true,
      normalLoad: body.normalLoad ? parseInt(body.normalLoad, 10) : 3,
      specialization: body.specialization || null,
      ...(body.role === "SUBJECT_EXPERT" && body.outsideExpert ? { canTeach: false, organization: typeof body.organization === "string" && body.organization.trim() ? body.organization.trim() : null } : {}),
      organization: typeof body.organization === "string" && body.organization.trim() ? body.organization.trim().slice(0, 120) : null,
      secondaryRole: body.role === "SUBJECT_EXPERT" && body.secondaryRole === "INSTRUCTOR" && !body.outsideExpert ? "INSTRUCTOR" : null,
    },
  });

  if (facultyType) await prisma.facultyProfile.upsert({ where: { userId: created.id }, create: { userId: created.id, employmentType: facultyType }, update: { employmentType: facultyType } }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_ONBOARDED", entityType: "User", entityId: created.id, metadata: { role: body.role, facultyType } });

  const { passwordHash: _omit, ...safe } = created;
  return NextResponse.json({ user: safe }, { status: 201 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
