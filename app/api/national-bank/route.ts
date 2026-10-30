import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { applySnapshot, eligibleCourses, type Snapshot } from "../../../lib/publicCourse";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../lib/contentSync";
import { chairmanIdFor } from "../../../lib/reportScope";
import { nbdb, nationalMember, FRAMEWORKS } from "../../../lib/nationalBank";
import { notifyUsers } from "../../../lib/notifications";
import { withErrors } from "../../../lib/apiHandler";

const t = (v: unknown, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// The national curriculum bank: the platform names the national authority (HEC); its committee reviews courses universities
// share, builds versioned national releases from them, and every university can import a release course (crediting the
// university whose course it came from).
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "setAuthority") {
      if (user.role !== "SUPER_USER") return NextResponse.json({ error: "Only the platform owner names the national authority." }, { status: 403 });
      const head = await prisma.user.findFirst({ where: { id: String(b.chairmanId || ""), role: "CHAIRMAN" as never } });
      if (!head) return NextResponse.json({ error: "Choose an institute head account." }, { status: 400 });
      if (b.remove) await nbdb.nationalAuthority.deleteMany({ where: { chairmanId: head.id } });
      else await nbdb.nationalAuthority.upsert({ where: { chairmanId: head.id }, create: { chairmanId: head.id, name: t(b.name, 60) || "HEC" }, update: { name: t(b.name, 60) || "HEC" } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "import") {
      if (!["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"].includes(user.role)) return NextResponse.json({ error: "Subject Experts, Instructors and Program Leads import courses." }, { status: 403 });
      const rc = (await nbdb.nationalReleaseCourse.findUnique({ where: { id: String(b.releaseCourseId || "") } })) as { id: string; releaseId: string; publicCourseId: string | null; snapshotJson: string; code: string } | null;
      const rel = rc ? ((await nbdb.nationalRelease.findUnique({ where: { id: rc.releaseId } })) as { status: string; version: number; framework: string } | null) : null;
      if (!rc || !rel || rel.status === "DRAFT") return NextResponse.json({ error: "That national course isn't available." }, { status: 404 });
      const target = (await eligibleCourses(user)).find((c) => c.id === b.targetCourseId);
      if (!target) return NextResponse.json({ error: "Choose one of your own courses." }, { status: 403 });
      if (target.plan === "SE") { const blocked = await blockedAsNonBaseCourse(target.id); if (blocked) return NextResponse.json({ error: blocked }, { status: 409 }); }
      const marks = await prisma.studentMark.count({ where: { courseId: target.id } });
      if (marks) return NextResponse.json({ error: `This course already has ${marks} student mark(s); importing would delete graded work.` }, { status: 409 });
      if (target.plan === "INSTRUCTOR" && (await prisma.attendanceRecord.count({ where: { courseId: target.id } }))) return NextResponse.json({ error: "Attendance has already been taken for this course." }, { status: 409 });
      if ((await prisma.cLO.count({ where: { courseId: target.id, source: target.plan } })) && !b.confirmReplace) return NextResponse.json({ error: "This course already has a plan. Importing replaces its CLOs, lecture plan and assessments.", needsConfirm: true }, { status: 409 });
      const result = await applySnapshot(JSON.parse(rc.snapshotJson) as Snapshot, target.id, target.plan, user.id);
      if (!result) return NextResponse.json({ error: "course not found" }, { status: 404 });
      await nbdb.nationalAdoption.create({ data: { releaseCourseId: rc.id, chairmanId: await chairmanIdFor(user), courseId: target.id, importedById: user.id } });
      if (rc.publicCourseId) { // credit the university whose course became the national one
        await prisma.publicCourseImport.create({ data: { publicCourseId: rc.publicCourseId, importedById: user.id, importedIntoCourseId: target.id } }).catch(() => null);
        await prisma.publicCourse.update({ where: { id: rc.publicCourseId }, data: { importCount: { increment: 1 } } }).catch(() => null);
      }
      await writeAuditLog({ actorUserId: user.id, action: "NATIONAL_COURSE_IMPORTED", entityType: "Course", entityId: target.id, metadata: { releaseCourseId: rc.id, framework: rel.framework, version: rel.version } });
      if (target.plan === "SE") await syncCourseContentToLinkedCourses(target.id);
      return NextResponse.json({ ok: true, ...result });
    }
    // Everything below is the national committee's work.
    const nat = await nationalMember(user);
    if (!nat) return NextResponse.json({ error: "Only the national authority's committee can do this." }, { status: 403 });
    if (b.action === "review") {
      const pc = await prisma.publicCourse.findFirst({ where: { id: String(b.publicCourseId || ""), status: "PUBLIC" }, select: { id: true, authorId: true, code: true, title: true } });
      if (!pc || !["RECOMMEND", "REVISE", "REJECT"].includes(b.verdict)) return NextResponse.json({ error: "Choose a course and a verdict." }, { status: 400 });
      const data = { verdict: b.verdict, comment: t(b.comment, 3000) };
      await nbdb.bankReview.upsert({ where: { publicCourseId_reviewerId: { publicCourseId: pc.id, reviewerId: user.id } }, create: { publicCourseId: pc.id, reviewerId: user.id, ...data }, update: data });
      await notifyUsers([pc.authorId], { kind: "ASSIGNMENT", title: `${nat.name} review of your shared course ${pc.code}`, body: `${b.verdict === "RECOMMEND" ? "Recommended for the national curriculum" : b.verdict === "REVISE" ? "Revision suggested" : "Not recommended"}${data.comment ? `: ${data.comment}` : ""}`, href: "/national-bank?tab=contributions" });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "createRelease") {
      const framework = FRAMEWORKS.includes(b.framework) ? b.framework : null, discipline = t(b.discipline, 120);
      if (!framework || !discipline) return NextResponse.json({ error: "Choose the framework and the discipline (e.g. BS Computer Science)." }, { status: 400 });
      const last = (await nbdb.nationalRelease.findFirst({ where: { framework, discipline }, orderBy: { version: "desc" } })) as { version: number } | null;
      const version = (last?.version || 0) + 1;
      await nbdb.nationalRelease.create({ data: { authorityId: nat.chairmanId, framework, discipline, version, title: t(b.title, 160) || `${framework} ${discipline} — version ${version}`, notes: t(b.notes, 4000), createdById: user.id } });
      return NextResponse.json({ ok: true });
    }
    const rel = (await nbdb.nationalRelease.findFirst({ where: { id: String(b.releaseId || ""), authorityId: nat.chairmanId } })) as { id: string; status: string; framework: string; discipline: string; title: string } | null;
    if (!rel) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    if (b.action === "addCourse") {
      if (rel.status !== "DRAFT") return NextResponse.json({ error: "Published releases can't change; start a new version." }, { status: 400 });
      const pc = await prisma.publicCourse.findFirst({ where: { id: String(b.publicCourseId || ""), status: "PUBLIC" } });
      if (!pc) return NextResponse.json({ error: "Choose a shared course." }, { status: 400 });
      await nbdb.nationalReleaseCourse.deleteMany({ where: { releaseId: rel.id, code: pc.code } });
      await nbdb.nationalReleaseCourse.create({ data: { releaseId: rel.id, publicCourseId: pc.id, code: pc.code, title: pc.title, creditHours: pc.creditHours, courseType: pc.courseType, snapshotJson: pc.snapshotJson, contributorInstitute: pc.instituteName || pc.authorOrganization, contributorId: pc.authorId } });
      await notifyUsers([pc.authorId], { kind: "ASSIGNMENT", title: `Your course ${pc.code} is in the ${rel.title}`, body: `${nat.name} chose your shared course for the national curriculum. Thank you for helping others build.`, href: "/national-bank" });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "removeCourse") { if (rel.status !== "DRAFT") return NextResponse.json({ error: "Published releases can't change." }, { status: 400 }); await nbdb.nationalReleaseCourse.deleteMany({ where: { id: String(b.id || ""), releaseId: rel.id } }); return NextResponse.json({ ok: true }); }
    if (b.action === "publish") {
      { const pt = await import("../../../lib/platformTeam"); if (user.role !== "CHAIRMAN" && (await pt.teamScope(user.id)) && !(await pt.isConvener(user.id))) return NextResponse.json({ error: "The team's Convener publishes a national release." }, { status: 403 }); }
      if (!(await nbdb.nationalReleaseCourse.count({ where: { releaseId: rel.id } }))) return NextResponse.json({ error: "Add courses first." }, { status: 400 });
      await nbdb.nationalRelease.updateMany({ where: { framework: rel.framework, discipline: rel.discipline, status: "PUBLISHED", id: { not: rel.id } }, data: { status: "RETIRED" } });
      await nbdb.nationalRelease.update({ where: { id: rel.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "NATIONAL_RELEASE_PUBLISHED", entityType: "NationalRelease", entityId: rel.id, metadata: { title: rel.title } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "deleteRelease") { if (rel.status !== "DRAFT") return NextResponse.json({ error: "Only drafts can be deleted." }, { status: 400 }); await nbdb.nationalReleaseCourse.deleteMany({ where: { releaseId: rel.id } }); await nbdb.nationalRelease.delete({ where: { id: rel.id } }); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_national_bank.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
