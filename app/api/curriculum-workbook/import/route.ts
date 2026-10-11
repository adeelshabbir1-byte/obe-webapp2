import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { importCurriculumWorkbook } from "../../../../lib/curriculumWorkbookImport";

export const maxDuration = 300;

// One workbook -> one new master curriculum. Super User: an official (shared) curriculum. OMC / Institute Head: the institute's own.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["SUPER_USER", "OMC", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await req.formData().catch(() => null))?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file" }, { status: 400 });
  const chairmanId = user.role === "SUPER_USER" ? null : user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  if (chairmanId === "") return NextResponse.json({ error: "your account is not linked to an institute" }, { status: 400 });
  const r = await importCurriculumWorkbook(file, { chairmanId });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "CURRICULUM_WORKBOOK_IMPORTED", entityType: "MasterCurriculum", entityId: r.id, metadata: { title: r.title, courses: r.courses, clos: r.clos, topics: r.topics } });
  return NextResponse.json(r);
}
