import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// Tags a batch of courses and/or faculty with one category (or clears
// it, if categoryId is null) — either kind can be sent in the same
// call, since a Coordinator often wants to tag a course and its likely
// instructors together in one pass.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const chairmanId = user.managedById || "";
  const courseIds: string[] = Array.isArray(body.courseIds) ? body.courseIds : [];
  const facultyIds: string[] = Array.isArray(body.facultyIds) ? body.facultyIds : [];
  if (courseIds.length === 0 && facultyIds.length === 0) return NextResponse.json({ error: "no courses or faculty selected" }, { status: 400 });

  let categoryId: string | null = null;
  if (body.categoryId) {
    const category = await prisma.customCategory.findUnique({ where: { id: body.categoryId } });
    if (!category || category.chairmanId !== chairmanId) return NextResponse.json({ error: "invalid category" }, { status: 400 });
    categoryId = category.id;
  }

  let coursesUpdated = 0, facultyUpdated = 0;
  if (courseIds.length > 0) {
    const result = await prisma.course.updateMany({ where: { id: { in: courseIds }, coordinatorId: user.id }, data: { customCategoryId: categoryId } });
    coursesUpdated = result.count;
  }
  if (facultyIds.length > 0) {
    const result = await prisma.user.updateMany({ where: { id: { in: facultyIds }, managedById: user.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } }, data: { customCategoryId: categoryId } });
    facultyUpdated = result.count;
  }

  return NextResponse.json({ coursesUpdated, facultyUpdated });
}
