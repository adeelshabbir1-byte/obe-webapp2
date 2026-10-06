import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// The author takes a course back out of the library. Copies already imported elsewhere are unaffected.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const pc = await prisma.publicCourse.findUnique({ where: { id: params.id } });
  if (!pc || pc.authorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.publicCourse.update({ where: { id: pc.id }, data: { status: "WITHDRAWN" } });
  await writeAuditLog({ actorUserId: user.id, action: "PUBLIC_COURSE_WITHDRAWN", entityType: "PublicCourse", entityId: pc.id });
  return NextResponse.json({ ok: true });
}
