import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

// Sets which degree programs belong to this department. A program belongs to exactly one department,
// so ticking it here moves it out of whichever department had it before.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dept = await prisma.department.findFirst({ where: { id: params.id, chairmanId: user.id } });
  if (!dept) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.programs)) return NextResponse.json({ error: "programs is required" }, { status: 400 });
  const programs: string[] = Array.from(new Set<string>(body.programs.filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0).map((p: string) => p.trim())));

  await prisma.departmentProgram.deleteMany({ where: { departmentId: dept.id, degreeProgram: { notIn: programs } } });
  if (programs.length > 0) {
    await prisma.departmentProgram.deleteMany({ where: { chairmanId: user.id, degreeProgram: { in: programs }, departmentId: { not: dept.id } } });
    const have = await prisma.departmentProgram.findMany({ where: { departmentId: dept.id }, select: { degreeProgram: true } });
    const haveSet = new Set<string>(have.map((h: { degreeProgram: string }) => h.degreeProgram));
    const toAdd = programs.filter((p) => !haveSet.has(p));
    if (toAdd.length > 0) {
      await prisma.departmentProgram.createMany({ data: toAdd.map((degreeProgram) => ({ departmentId: dept.id, chairmanId: user.id, degreeProgram })) });
    }
  }
  return NextResponse.json({ ok: true, programs });
}
