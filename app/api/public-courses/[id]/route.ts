import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

// Full preview of a public course (CLOs, lecture plan, assessments). Anyone who can use the library may view a PUBLIC one;
// the author and the author's coordinator may also view it while it is still pending.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const pc = await prisma.publicCourse.findUnique({ where: { id: params.id }, include: { author: { select: { name: true, managedById: true } } } });
  if (!pc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const isOwnerOrManager = pc.authorId === user.id || pc.author.managedById === user.id;
  if (pc.status !== "PUBLIC" && !isOwnerOrManager) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { snapshotJson, searchText, ...rest } = pc;
  return NextResponse.json({ course: { ...rest, authorName: pc.author.name }, snapshot: JSON.parse(snapshotJson) });
}
