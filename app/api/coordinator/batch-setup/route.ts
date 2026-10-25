import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { findOwningChairmanId } from "../../../../lib/institutionCurriculum";
import { sourcesForProgram, curriculumBoard, batchBoard } from "../../../../lib/batchBoard";
import * as bs from "../../../../lib/batchSetup";

const db = prisma as unknown as Record<string, any>;

// GET ?sources=<program> | ?preview=c:<curriculumId>|b:<batchId> | ?tracks=<curriculumId> | ?search=<text>&batchId=
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const chairmanId = (await findOwningChairmanId(user.id)) || "";
  if (q.get("sources")) return NextResponse.json({ rows: await sourcesForProgram(chairmanId, user.id, q.get("sources")!) });
  const pv = q.get("preview") || "";
  if (pv.startsWith("c:")) return NextResponse.json({ board: await curriculumBoard(pv.slice(2)) });
  if (pv.startsWith("b:")) {
    const b = await prisma.batch.findFirst({ where: { id: pv.slice(2), coordinator: { managedById: chairmanId } }, select: { id: true } });
    return NextResponse.json({ board: b ? await batchBoard(b.id) : null });
  }
  if (q.get("tracks")) return NextResponse.json({ tracks: await db.curriculumTrack.findMany({ where: { curriculumId: q.get("tracks") }, orderBy: { position: "asc" }, select: { id: true, name: true } }).catch(() => []) });
  const text = (q.get("search") || "").trim();
  if (text.length >= 2) {
    const like = { contains: text, mode: "insensitive" as const };
    const [batchCourses, masters] = await Promise.all([
      prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, batchId: { not: q.get("batchId") || "none" }, OR: [{ code: like }, { title: like }] }, take: 25, orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, batch: { select: { degreeProgram: true, batchName: true } }, subjectHomeDepartment: { select: { name: true } } } }),
      prisma.masterCourse.findMany({ where: { OR: [{ code: like }, { title: like }], masterCurriculum: { status: "PUBLISHED", OR: [{ chairmanId: null }, { chairmanId }] } }, take: 25, select: { id: true, code: true, title: true, creditHours: true, category: true, masterCurriculum: { select: { authority: true, title: true, version: true } } } }),
    ]);
    return NextResponse.json({ results: [
      ...batchCourses.map((c) => ({ kind: "course", id: c.id, code: c.code, title: c.title, ch: c.creditHours, type: c.courseType, from: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`.trim(), home: c.subjectHomeDepartment?.name || null })),
      ...masters.map((m) => ({ kind: "master", id: m.id, code: m.code, title: m.title, ch: m.creditHours, type: m.category, from: `${m.masterCurriculum.authority} ${m.masterCurriculum.title} ${m.masterCurriculum.version}`, home: null })),
    ] });
  }
  return NextResponse.json({ error: "?" }, { status: 400 });
}

// POST { action, batchId, ... } — the Program Lead's own batch.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batch = await prisma.batch.findFirst({ where: { id: String(b.batchId || ""), coordinatorId: user.id }, select: { id: true } });
  if (!batch) return NextResponse.json({ error: "Not your batch." }, { status: 404 });
  const mine = async (id: unknown) => { const c = await prisma.course.findFirst({ where: { id: String(id || ""), batchId: batch.id }, select: { id: true } }); if (!c) throw new Error("Not a course of this batch."); return c.id; };
  const by = { id: user.id, name: user.name };
  try {
    switch (b.action) {
      case "equalise": await bs.equalise(by, await mine(b.courseId), String(b.prevCourseId || "")); return NextResponse.json({ ok: true, message: "Equalised — home department taken from the course already taught." });
      case "equaliseAll": { // accept every suggestion at once
        const st = await bs.setupStatus(batch.id); let n = 0;
        for (const r of st?.rows || []) if (!r.matched && !r.isNew && r.suggestion) { await bs.equalise(by, r.id, r.suggestion.id); n++; }
        return NextResponse.json({ ok: true, message: `${n} course(s) equalised with the suggested course.` });
      }
      case "new": await bs.markNew(by, await mine(b.courseId), b.departmentId ? String(b.departmentId) : null); return NextResponse.json({ ok: true, message: "Marked as a new course." });
      case "home": await bs.setHome(await mine(b.courseId), b.departmentId ? String(b.departmentId) : null); return NextResponse.json({ ok: true, message: "Home department saved." });
      case "naming": { const n = await bs.saveNaming(by, batch.id, Array.isArray(b.picks) ? b.picks : []); return NextResponse.json({ ok: true, message: `${n} course(s) renamed / recoded. Names and codes saved for the next batch too.` }); }
      case "merge": return NextResponse.json({ ok: true, message: await bs.mergeDuplicates(by, batch.id) });
      case "remove": await bs.removeCourse(by, await mine(b.courseId), String(b.why || "").slice(0, 300)); return NextResponse.json({ ok: true, message: "Removed." });
      case "add": { const n = await bs.addCourse(by, batch.id, b.kind === "master" ? { masterCourseId: String(b.id) } : { courseId: String(b.id) }, String(b.type || ""), b.semester ? Number(b.semester) : null); return NextResponse.json({ ok: true, message: `${n.code} ${n.title} added.` }); }
      case "tracks": await bs.setOfferedTracks(batch.id, Array.isArray(b.tracks) ? b.tracks.map((t: { id: string; name: string }) => ({ id: String(t.id), name: String(t.name || "") })) : []); return NextResponse.json({ ok: true, message: "Tracks saved." });
      case "reset": { // "Start again with another source": only while nobody studies any course of the batch
        const cs = await prisma.course.findMany({ where: { batchId: batch.id }, select: { id: true, _count: { select: { studentEnrollments: true, studentMarks: true, attendanceRecords: true } } } });
        if (cs.some((c) => c._count.studentEnrollments || c._count.studentMarks || c._count.attendanceRecords)) throw new Error("This batch already has students, marks or attendance — its courses can't be replaced.");
        const { deleteCourseCompletely } = await import("../../../../lib/deleteCourseCompletely");
        for (const c of cs) await deleteCourseCompletely(c.id);
        await db.batchCurriculumSource.deleteMany({ where: { batchId: batch.id } }).catch(() => null);
        await db.batchCourseNew.deleteMany({ where: { batchId: batch.id } }).catch(() => null);
        await bs.logChange(batch.id, by, "RESET", {}, `all ${cs.length} course(s) removed to start again`);
        return NextResponse.json({ ok: true, message: `${cs.length} course(s) removed. Choose the source again.` });
      }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? "Run prisma/migration_batch_setup.sql (System Health → Run migrations)." : m.slice(0, 300) }, { status: 400 });
  }
}
