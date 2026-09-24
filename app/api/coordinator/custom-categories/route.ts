import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.managedById || "";

  const categories = await prisma.customCategory.findMany({
    where: { chairmanId },
    include: { _count: { select: { courses: true, faculty: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({ id: c.id, name: c.name, courseCount: c._count.courses, facultyCount: c._count.faculty })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const chairmanId = user.managedById || "";
  const existing = await prisma.customCategory.findUnique({ where: { chairmanId_name: { chairmanId, name } } });
  if (existing) return NextResponse.json({ error: "a category with this name already exists" }, { status: 409 });

  const category = await prisma.customCategory.create({ data: { chairmanId, name } });
  return NextResponse.json({ category: { id: category.id, name: category.name, courseCount: 0, facultyCount: 0 } }, { status: 201 });
}
