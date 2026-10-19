import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { setupDemo, coursesStep, activityStep, finishDemo, deletePass, demoSummary } from "../../../../lib/demoInstitute";
import { addBusinessSchool, campusPeople, campusStudents, campusAccreditation, campusActivity } from "../../../../lib/demoCampus";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One step of building or removing the demo institute per call (Super User only); the page drives the steps.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.step === "setup") {
      if (!b.csBatchId || !b.aiBatchId) return NextResponse.json({ error: "Pick both source batches." }, { status: 400 });
      const out = await setupDemo(user.id, [{ sourceBatchId: b.csBatchId, short: "CS" }, { sourceBatchId: b.aiBatchId, short: "AI" }]);
      return NextResponse.json({ batches: out.map((o) => ({ demoBatchId: o.demoBatchId, sourceBatchId: o.sourceBatchId })) });
    }
    if (b.step === "courses" || b.step === "activity") {
      const batch = await prisma.batch.findUnique({ where: { id: String(b.demoBatchId) }, select: { coordinatorId: true } });
      if (!batch) return NextResponse.json({ error: "Demo batch not found." }, { status: 404 });
      if (b.step === "activity") return NextResponse.json({ done: await activityStep(String(b.demoBatchId), Number(b.semester)) });
      const teachers = await prisma.user.findMany({ where: { managedById: batch.coordinatorId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never } }, orderBy: { username: "asc" }, select: { id: true } });
      return NextResponse.json({ done: await coursesStep(String(b.demoBatchId), String(b.sourceBatchId), Number(b.semester), teachers.map((t) => t.id)) });
    }
    if (b.step === "business") return NextResponse.json({ batch: await addBusinessSchool() });
    if (b.step === "finishBatch") { await finishDemo([String(b.demoBatchId)]); return NextResponse.json({ ok: true }); }
    if (b.step === "campus") {
      const part = String(b.part);
      const done = part === "people" ? await campusPeople() : part === "students" ? await campusStudents() : part === "accreditation" ? await campusAccreditation() : part === "activity" ? await campusActivity() : null;
      return NextResponse.json({ done, summary: part === "activity" ? await demoSummary() : undefined });
    }
    if (b.step === "finish") { await finishDemo(); return NextResponse.json({ summary: await demoSummary() }); }
    if (b.step === "delete") return NextResponse.json(await deletePass());
    return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
