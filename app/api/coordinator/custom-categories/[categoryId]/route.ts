import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: NextRequest, { params }: { params: { categoryId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const category = await prisma.customCategory.findUnique({ where: { id: params.categoryId } });
  if (!category || category.chairmanId !== (user.managedById || "")) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Deleting a category just un-tags whatever it was applied to — never
  // deletes a course or a faculty member, only clears the label.
  await prisma.course.updateMany({ where: { customCategoryId: category.id }, data: { customCategoryId: null } });
  await prisma.user.updateMany({ where: { customCategoryId: category.id }, data: { customCategoryId: null } });
  await prisma.customCategory.delete({ where: { id: category.id } });

  return NextResponse.json({ ok: true });
}
