import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { accessFor, setMeta, MISSING } from "../../../../../lib/topicPlan";
import { forbidden, wsUser } from "../../../../../lib/topicApi";

// PATCH { courseId, plan, lectureRowId, industry?, reading?, cloId? } — facts about one topic of a plan the person owns:
// industry relevance, the reading (book chapter), and confirming the CLO of a topic moved in from another course.
export async function PATCH(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const a = await accessFor(user, String(b.courseId || ""), b.plan === "SE" ? "SE" : b.plan === "INSTRUCTOR" ? "INSTRUCTOR" : null);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (a.mode !== "APPLY") return NextResponse.json({ error: `Only the owner of this plan changes it directly (${a.why}).` }, { status: 403 });
  const row = await prisma.lectureRow.findUnique({ where: { id: String(b.lectureRowId || "") }, select: { id: true, courseId: true, source: true } });
  if (!row || row.courseId !== a.planCourseId || row.source !== a.plan) return NextResponse.json({ error: "That topic is not in this plan." }, { status: 404 });
  const data: Record<string, unknown> = {};
  if ("industry" in b) data.industry = ["HIGH", "MEDIUM", "LOW"].includes(b.industry) ? b.industry : null;
  if ("reading" in b) data.reading = typeof b.reading === "string" ? b.reading.trim().slice(0, 300) || null : null;
  if ("cloId" in b) {
    const clo = b.cloId ? await prisma.cLO.findFirst({ where: { id: String(b.cloId), courseId: a.planCourseId, source: a.plan } }) : null;
    if (b.cloId && !clo) return NextResponse.json({ error: "That CLO is not in this plan." }, { status: 400 });
    await prisma.lectureRow.update({ where: { id: row.id }, data: { cloId: clo?.id || null } });
    data.needsClo = false;
  }
  try { await setMeta(row.id, a.planCourseId, data, user.id); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
