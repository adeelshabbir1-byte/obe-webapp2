import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { pdb, storeFile, MAX_FILE } from "../../../../lib/portfolio";
import { withErrors } from "../../../../lib/apiHandler";

// A student hands in (or replaces, until graded) their work for an open hand-in point.
async function POST_handler(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  const box = (await pdb.dropbox.findUnique({ where: { id: String(fd.get("boxId") || "") } }).catch(() => null)) as { id: string; courseId: string; dueAt: Date; allowLate: boolean; status: string } | null;
  if (!box) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const enr = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId: box.courseId } } });
  if (!enr || enr.status === "WITHDRAWN") return NextResponse.json({ error: "You are not enrolled in this course." }, { status: 403 });
  const late = Date.now() > box.dueAt.getTime();
  if (box.status !== "OPEN" || (late && !box.allowLate)) return NextResponse.json({ error: "Submissions are closed." }, { status: 400 });
  if (!file || !file.size) return NextResponse.json({ error: "Choose your file." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: "File is over 8 MB. Compress it or share a link in the note." }, { status: 400 });
  const prev = (await pdb.submission.findUnique({ where: { dropboxId_studentId: { dropboxId: box.id, studentId: st.id } } })) as { gradedAt: Date | null } | null;
  if (prev?.gradedAt) return NextResponse.json({ error: "Already graded — ask your teacher to reopen it." }, { status: 400 });
  try {
    const fileUrl = await storeFile(file);
    const data = { fileName: file.name.slice(0, 200), fileUrl, note: typeof fd.get("note") === "string" ? String(fd.get("note")).slice(0, 2000) : null, submittedAt: new Date(), late };
    await pdb.submission.upsert({ where: { dropboxId_studentId: { dropboxId: box.id, studentId: st.id } }, create: { dropboxId: box.id, studentId: st.id, ...data }, update: data });
    return NextResponse.json({ ok: true, late });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
