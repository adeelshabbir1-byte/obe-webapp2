import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { importClosIntoMasterCurriculum } from "../../../../../../lib/masterClos";

export const maxDuration = 120;

// Super User: load CLOs and PLO mapping from Excel into an official (shared) curriculum, so every institute benefits.
export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId }, select: { id: true, chairmanId: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.chairmanId) return NextResponse.json({ error: "This is an institute's own copy; open the official curriculum instead." }, { status: 400 });
  const file = (await req.formData()).get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file first" }, { status: 400 });
  const r = await importClosIntoMasterCurriculum(c.id, file);
  if (!r.ok) return NextResponse.json({ error: r.error, errors: r.errors }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "OFFICIAL_CLOS_IMPORTED_FROM_FILE", entityType: "MasterCurriculum", entityId: c.id, metadata: { courses: r.courses, clos: r.clos } });
  return NextResponse.json({ courses: r.courses, clos: r.clos, errors: r.errors });
}
