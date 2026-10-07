import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { curriculaVisibleTo } from "../../../lib/curriculumAccess";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";

// Published master curricula this user may browse: the Super User sees all of them; everyone else sees
// only their own institute's copies plus the official ones the Super User assigned to their institute.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const chairmanId = user.role === "SUPER_USER" ? null : await findOwningChairmanId(user.id);
  const curricula = await prisma.masterCurriculum.findMany({
    where: user.role === "SUPER_USER" ? { status: "PUBLISHED" } : { status: "PUBLISHED", ...(chairmanId ? curriculaVisibleTo(chairmanId) : { id: "none" }) },
    include: { courses: { orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }, plos: { orderBy: { number: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ curricula });
}
