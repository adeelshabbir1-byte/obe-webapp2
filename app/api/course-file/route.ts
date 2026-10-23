import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { courseFilePdf, syncCourseFolders } from "../../../lib/courseFile";
import { writeAuditLog } from "../../../lib/audit";

export const maxDuration = 60;

/**
 * GET ?courseId= — one course file as a PDF (its teacher, its Program Lead, or anyone who reviews its batch).
 * GET ?batch=<id>&semester=<n|all> — every offered course of a batch (or one semester) as PDFs in one ZIP.
 */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const where = await reviewBatchWhere(user);
  const courseId = q.get("courseId");
  if (courseId) {
    const c = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, coordinatorId: true, batchId: true } });
    const ok = c && (c.instructorId === user.id || c.coordinatorId === user.id || (where && c.batchId && (await prisma.batch.count({ where: { AND: [{ id: c.batchId }, where] } }))));
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const f = await courseFilePdf(courseId);
    if (!f) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    return new NextResponse(Buffer.from(f.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${f.filename}"` } });
  }
  const batchId = q.get("batch");
  if (!batchId || !where || !(await prisma.batch.count({ where: { AND: [{ id: batchId }, where] } }))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sem = q.get("semester");
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, batchName: true } });
  const courses = await prisma.course.findMany({ where: { batchId, isOffered: true, ...(sem && sem !== "all" ? { semesterNumber: Number(sem) } : {}) }, select: { id: true, code: true, coordinatorId: true }, orderBy: { code: "asc" } });
  if (!courses.length) return NextResponse.json({ error: "No offered course in this batch / semester." }, { status: 404 });
  if (courses.length > 40) return NextResponse.json({ error: "Choose one semester (more than 40 courses at once)." }, { status: 400 });
  const status = await syncCourseFolders(courses);
  const zip = new JSZip();
  for (const c of courses) { const f = await courseFilePdf(c.id); if (f) zip.file(f.filename, f.bytes); }
  const lines = courses.map((c) => { const s = status.get(c.id); return `${c.code}\t${s?.complete ? "complete" : `missing: ${s?.missing.join(", ")}`}`; });
  zip.file("Contents.txt", `Course files - ${batch?.degreeProgram} ${batch?.batchName}${sem && sem !== "all" ? ` - semester ${sem}` : ""}\r\n\r\n${lines.join("\r\n")}\r\n`);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_FILES_DOWNLOADED", entityType: "Batch", entityId: batchId, metadata: { courses: courses.length } });
  const name = `Course files - ${batch?.degreeProgram} ${batch?.batchName}${sem && sem !== "all" ? ` semester ${sem}` : ""}.zip`.replace(/[^\w .()-]+/g, "");
  return new NextResponse(buf as unknown as ArrayBuffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` } });
}
