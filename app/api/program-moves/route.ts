import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";

const TEACHING = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"];

// The Chairman (own department) or a Dean (departments of the faculty) asks to move a teacher to another Program Lead's program.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "HEAD_OF_DEPARTMENT" && user.role !== "DEAN")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.managedById || "";
  const body = await req.json().catch(() => ({}));
  if (!body.teacherId || !body.toCoordinatorId) return NextResponse.json({ error: "choose the teacher and the program to move to" }, { status: 400 });

  const teacher = await prisma.user.findFirst({ where: { id: body.teacherId, role: { in: TEACHING as ("INSTRUCTOR" | "SUBJECT_EXPERT" | "LAB_ENGINEER")[] }, isVisitingPlaceholder: false, managedBy: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" } }, include: { managedBy: true } });
  if (!teacher || !teacher.managedBy) return NextResponse.json({ error: "teacher not found" }, { status: 404 });
  const to = await prisma.user.findFirst({ where: { id: body.toCoordinatorId, role: "PROGRAM_COORDINATOR", managedById: chairmanId } });
  if (!to) return NextResponse.json({ error: "program lead not found" }, { status: 404 });
  if (to.id === teacher.managedBy.id) return NextResponse.json({ error: "the teacher is already in that program" }, { status: 400 });
  const deptId = teacher.managedBy.departmentId;
  if (!deptId || to.departmentId !== deptId) return NextResponse.json({ error: "a teacher can only be moved between programs of the same department" }, { status: 400 });

  if (user.role === "HEAD_OF_DEPARTMENT" && deptId !== user.departmentId) return NextResponse.json({ error: "you can only move teachers of your own department" }, { status: 403 });
  if (user.role === "DEAN") {
    const dept = await prisma.department.findFirst({ where: { id: deptId, chairmanId, facultyId: user.facultyId || "none" } });
    if (!dept) return NextResponse.json({ error: "that department is not in your faculty" }, { status: 403 });
  }
  if (await prisma.teacherProgramMove.count({ where: { teacherId: teacher.id, status: "PENDING" } }) > 0) return NextResponse.json({ error: "a move for this teacher is already waiting for approval" }, { status: 409 });

  const move = await prisma.teacherProgramMove.create({
    data: { chairmanId, teacherId: teacher.id, fromCoordinatorId: teacher.managedBy.id, toCoordinatorId: to.id, requestedById: user.id, note: typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null },
  });
  await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_MOVE_REQUESTED", entityType: "User", entityId: teacher.id, metadata: { from: teacher.managedBy.id, to: to.id } });
  return NextResponse.json({ ok: true, id: move.id }, { status: 201 });
}

// A Program Lead accepts or declines (the lead the teacher leaves, and the lead the teacher joins, each answer once);
// the person who asked can withdraw the request.
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const move = body.id ? await prisma.teacherProgramMove.findUnique({ where: { id: body.id } }) : null;
  if (!move || move.status !== "PENDING") return NextResponse.json({ error: "this request is no longer open" }, { status: 404 });

  if (body.decision === "CANCEL") {
    if (move.requestedById !== user.id) return NextResponse.json({ error: "only the person who asked can withdraw it" }, { status: 403 });
    await prisma.teacherProgramMove.update({ where: { id: move.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  if (user.role !== "PROGRAM_COORDINATOR" || (user.id !== move.fromCoordinatorId && user.id !== move.toCoordinatorId)) return NextResponse.json({ error: "only the two Program Leads concerned can answer" }, { status: 403 });
  if (body.decision !== "APPROVE" && body.decision !== "REJECT") return NextResponse.json({ error: "choose approve or decline" }, { status: 400 });
  const answer = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";

  const data: { fromStatus?: string; toStatus?: string } = {};
  if (user.id === move.fromCoordinatorId) data.fromStatus = answer;
  if (user.id === move.toCoordinatorId) data.toStatus = answer;
  const fromStatus = data.fromStatus || move.fromStatus;
  const toStatus = data.toStatus || move.toStatus;

  if (fromStatus === "REJECTED" || toStatus === "REJECTED") {
    await prisma.teacherProgramMove.update({ where: { id: move.id }, data: { ...data, status: "REJECTED", decidedAt: new Date() } });
  } else if (fromStatus === "APPROVED" && toStatus === "APPROVED") {
    const to = await prisma.user.findUnique({ where: { id: move.toCoordinatorId } });
    const teacher = await prisma.user.findFirst({ where: { id: move.teacherId, managedById: move.fromCoordinatorId } });
    if (!to || !teacher) {
      await prisma.teacherProgramMove.update({ where: { id: move.id }, data: { ...data, status: "CANCELLED", decidedAt: new Date() } });
      return NextResponse.json({ error: "the teacher or program has changed since the request, so it was cancelled" }, { status: 409 });
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: teacher.id }, data: { managedById: to.id, departmentId: to.departmentId } }),
      prisma.teacherProgramMove.update({ where: { id: move.id }, data: { ...data, status: "APPLIED", decidedAt: new Date() } }),
    ]);
    await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_MOVE_APPLIED", entityType: "User", entityId: teacher.id, metadata: { from: move.fromCoordinatorId, to: move.toCoordinatorId } });
  } else {
    await prisma.teacherProgramMove.update({ where: { id: move.id }, data });
  }
  await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_MOVE_ANSWERED", entityType: "User", entityId: move.teacherId, metadata: { answer } });
  return NextResponse.json({ ok: true });
}
