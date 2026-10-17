import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { idb } from "../../../../lib/indirectPlo";

// A student rates how well they can now do each CLO of a course they are enrolled in (1-5), once per course.
export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const courseId = String(b.courseId || "");
  const enr = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId } } });
  if (!enr) return NextResponse.json({ error: "You are not enrolled in that course." }, { status: 400 });
  const clos = await prisma.cLO.findMany({ where: { courseId }, select: { id: true } });
  const ok = new Set(clos.map((c) => c.id));
  const ratings: Record<string, number> = {};
  for (const [k, v] of Object.entries((b.ratings || {}) as Record<string, unknown>)) { const n = Math.round(Number(v)); if (ok.has(k) && n >= 1 && n <= 5) ratings[k] = n; }
  if (!Object.keys(ratings).length) return NextResponse.json({ error: "Rate at least one outcome." }, { status: 400 });
  try {
    await idb.courseExitResponse.upsert({ where: { courseId_studentId: { courseId, studentId: st.id } }, create: { courseId, studentId: st.id, ratingsJson: JSON.stringify(ratings), comment: typeof b.comment === "string" ? b.comment.slice(0, 2000) : null }, update: { ratingsJson: JSON.stringify(ratings), comment: typeof b.comment === "string" ? b.comment.slice(0, 2000) : null } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Course surveys are not set up yet." }, { status: 500 }); }
}
