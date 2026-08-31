import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";

// Any authenticated user can browse the published Master Curriculum library —
// it's read-only reference data, not tenant-scoped (spec section 7).
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const curricula = await prisma.masterCurriculum.findMany({
    where: { status: "PUBLISHED" },
    include: { courses: { orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }, plos: { orderBy: { number: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ curricula });
}
