import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { ALLOC_HINT, saveTimesTaught, saveWish, selfExperience, wishes } from "../../../../lib/autoAllocate";
import { withErrors } from "../../../../lib/apiHandler";

const ALLOWED_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT"];
const DEFAULT_SPECIALIZATION = "Computer Science";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Every course this faculty member's coordinator has ever offered,
  // across every batch — deduplicated to one entry per code in JS
  // rather than relying on Prisma's distinct(), which only collapses
  // rows where EVERY selected column matches; two batches' copies of
  // the "same" course often differ slightly in title (a stray space, a
  // punctuation difference), which would otherwise still show up as
  // separate rows despite sharing a code.
  //
  // "domain" (the specialization track, e.g. "Artificial Intelligence")
  // lives on MasterCourse, not on Course itself — Course only carries a
  // masterCourseId link, so it has to be fetched through that relation.
  // Base courses only: a course that follows a base course in a content-sync group is taught from that base, so the
  // priority is given once, on the base (standalone courses count as their own base).
  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: user.managedById || "", OR: [{ contentSyncMember: null }, { contentSyncMember: { isBase: true } }] },
    select: { code: true, title: true, courseType: true, masterCourse: { select: { domain: true } } },
    orderBy: { createdAt: "desc" }, // so the first one kept per code is the most recently offered
  });
  const byCode = new Map<string, { code: string; title: string; courseType: string; domain: string | null }>();
  for (const c of allCourses) if (!byCode.has(c.code)) byCode.set(c.code, { code: c.code, title: c.title, courseType: c.courseType, domain: c.masterCourse?.domain || null });
  const courses = Array.from(byCode.values());

  const preferences = await prisma.facultyCoursePreference.findMany({ where: { facultyId: user.id } });
  const priorityByCode = new Map(preferences.map((p) => [p.courseCode, p.priority]));
  const [self, wish] = await Promise.all([selfExperience([user.id]), wishes([user.id])]);
  const timesByCode = self.get(user.id) || new Map<string, number>();

  // Courses in the faculty member's own specialization surface first —
  // defaulting to Computer Science when none is set on their account,
  // since that's this platform's own base/default program.
  const mySpecialization = user.specialization || DEFAULT_SPECIALIZATION;
  courses.sort((a, b) => {
    const aMatch = a.domain === mySpecialization ? 0 : 1;
    const bMatch = b.domain === mySpecialization ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.code.localeCompare(b.code);
  });

  return NextResponse.json({
    mySpecialization,
    wish: wish.get(user.id) || null,
    courses: courses.map((c) => ({ code: c.code, title: c.title, courseType: c.courseType, domain: c.domain, priority: priorityByCode.get(c.code) || null, timesTaught: timesByCode.has(c.code) ? timesByCode.get(c.code)! : null })),
  });
}

async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  // This semester's wish: how many sections, and anything the Course Assigner should know.
  if (body.wish) {
    const max = body.wish.maxSections === "" || body.wish.maxSections == null ? null : parseInt(body.wish.maxSections, 10);
    if (max !== null && (!Number.isFinite(max) || max < 0 || max > 20)) return NextResponse.json({ error: "Number of sections must be 0–20." }, { status: 400 });
    try { await saveWish(user.id, max, String(body.wish.remarks || "").slice(0, 1000)); } catch { return NextResponse.json({ error: ALLOC_HINT }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  }
  // How many times they have taught a course before.
  if ("timesTaught" in body) {
    if (!body.courseCode) return NextResponse.json({ error: "courseCode is required" }, { status: 400 });
    const n = body.timesTaught === "" || body.timesTaught == null ? null : parseInt(body.timesTaught, 10);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 99)) return NextResponse.json({ error: "Times taught must be 0–99." }, { status: 400 });
    try { await saveTimesTaught(user.id, String(body.courseCode), n); } catch { return NextResponse.json({ error: ALLOC_HINT }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  }
  const { courseCode, priority } = body;
  if (!courseCode) return NextResponse.json({ error: "courseCode is required" }, { status: 400 });

  if (priority === null || priority === undefined) {
    // "Not interested" — no explicit record needed, that's the default.
    await prisma.facultyCoursePreference.deleteMany({ where: { facultyId: user.id, courseCode } });
    return NextResponse.json({ ok: true });
  }

  const p = parseInt(priority, 10);
  if (![1, 2, 3].includes(p)) return NextResponse.json({ error: "priority must be 1, 2, 3, or null" }, { status: 400 });

  await prisma.facultyCoursePreference.upsert({
    where: { facultyId_courseCode: { facultyId: user.id, courseCode } },
    create: { facultyId: user.id, courseCode, priority: p },
    update: { priority: p },
  });
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const PUT = withErrors(PUT_handler);
