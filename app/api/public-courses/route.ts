import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import { buildSnapshot, buildSearchText, eligibleCourses } from "../../../lib/publicCourse";

const VIEW_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR", "OMC", "CHAIRMAN", "SUPER_USER"];

const SUMMARY_SELECT = {
  id: true, code: true, title: true, creditHours: true, courseType: true, summary: true, instituteName: true, authorOrganization: true,
  status: true, version: true, importCount: true, plan: true, sourceCourseId: true, createdAt: true, updatedAt: true, reviewComment: true, authorId: true,
  author: { select: { name: true } },
} as const;

// scope=search (default): public courses matching ?q=   scope=mine: everything I published, any status
// scope=pending: courses by faculty I manage that are waiting for my approval
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !VIEW_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scope = req.nextUrl.searchParams.get("scope") || "search";

  if (scope === "mine") {
    const courses = await prisma.publicCourse.findMany({ where: { authorId: user.id }, select: SUMMARY_SELECT, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ courses });
  }
  if (scope === "pending") {
    if (user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const courses = await prisma.publicCourse.findMany({ where: { status: "PENDING", author: { managedById: user.id } }, select: SUMMARY_SELECT, orderBy: { updatedAt: "asc" } });
    return NextResponse.json({ courses });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const courses = await prisma.publicCourse.findMany({
    where: { status: "PUBLIC", AND: terms.map((t) => ({ searchText: { contains: t } })) },
    select: SUMMARY_SELECT, orderBy: [{ importCount: "desc" }, { updatedAt: "desc" }], take: 60,
  });
  return NextResponse.json({ courses });
}

// Publish (or re-publish) one of my courses to the public library.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  const mine = (await eligibleCourses(user)).find((c) => c.id === body?.courseId);
  if (!mine) return NextResponse.json({ error: "that isn't one of your courses" }, { status: 403 });

  const snapshot = await buildSnapshot(mine.id, mine.plan);
  if (!snapshot || snapshot.clos.length === 0 || snapshot.lectureRows.length === 0) {
    return NextResponse.json({ error: "Add at least one CLO and one lecture row before publishing — an empty course isn't useful to anyone." }, { status: 400 });
  }

  const chairmanId = await findOwningChairmanId(user.id);
  const chairman = chairmanId ? await prisma.user.findUnique({ where: { id: chairmanId } }) : null;
  const instituteName = chairman?.instituteName || null;
  // A coordinator (or platform expert) has no one below them to approve it; everyone else waits for their coordinator.
  const selfApproved = user.role === "PROGRAM_COORDINATOR" || (user as any).isPlatformExpert === true;
  const course = await prisma.course.findUnique({ where: { id: mine.id } });

  const data = {
    plan: mine.plan, instituteName, authorOrganization: (user as any).organization || null,
    code: mine.code, title: mine.title, creditHours: mine.creditHours, courseType: mine.courseType, summary: snapshot.catalogDescription,
    searchText: buildSearchText([mine.code, mine.title, user.name, instituteName, (user as any).organization, course?.courseType], snapshot),
    snapshotJson: JSON.stringify(snapshot),
    status: selfApproved ? "PUBLIC" : "PENDING", reviewedById: selfApproved ? user.id : null, reviewedAt: selfApproved ? new Date() : null, reviewComment: null as string | null,
  };

  const existing = await prisma.publicCourse.findFirst({ where: { authorId: user.id, sourceCourseId: mine.id, plan: mine.plan } });
  const saved = existing
    ? await prisma.publicCourse.update({ where: { id: existing.id }, data: { ...data, version: existing.version + 1 } })
    : await prisma.publicCourse.create({ data: { ...data, authorId: user.id, sourceCourseId: mine.id } });

  await writeAuditLog({ actorUserId: user.id, action: "PUBLIC_COURSE_PUBLISHED", entityType: "PublicCourse", entityId: saved.id, metadata: { status: saved.status, version: saved.version } });
  return NextResponse.json({ ok: true, status: saved.status, id: saved.id });
}
