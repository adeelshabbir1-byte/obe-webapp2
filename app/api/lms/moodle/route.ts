import { NextRequest, NextResponse } from "next/server";
import { itAccess } from "../../../../lib/itManager";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { moodleGradebook, saveLmsConfig, LMS_HINT } from "../../../../lib/moodle";

// GET ?courseId=&moodleCourseId= — the course's Moodle grades as a gradebook CSV (teacher of the course or Program Lead).
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get("courseId") || "";
  const mid = Number(req.nextUrl.searchParams.get("moodleCourseId"));
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, coordinatorId: true } });
  if (!c || (c.instructorId !== user.id && c.coordinatorId !== user.id)) return NextResponse.json({ error: "Only the course's teacher or Program Lead." }, { status: 403 });
  if (!Number.isInteger(mid) || mid < 1) return NextResponse.json({ error: "Enter the Moodle course id (the number in the course's Moodle address, …/course/view.php?id=…)." }, { status: 400 });
  try { const r = await moodleGradebook(await chairmanIdFor(user), courseId, mid); return NextResponse.json(r); }
  catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /lmsConfig|lmsCourseLink|does not exist/.test(m) ? LMS_HINT : m }, { status: 400 }); }
}

// POST { url, token } — the Institute Head links Moodle.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const it = user && user.mfaVerified ? await itAccess(user) : null;
  if (!user || !it || !it.canAct) return NextResponse.json({ error: "Only the IT Manager does this (the Institute Head until one is named)." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try { await saveLmsConfig(it.chairmanId, String(b.url || ""), String(b.token || "")); return NextResponse.json({ ok: true, message: "Saved." }); }
  catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /lmsConfig|does not exist/.test(m) ? LMS_HINT : m }, { status: 400 }); }
}
