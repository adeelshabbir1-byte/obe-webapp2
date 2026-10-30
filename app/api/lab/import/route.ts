import { NextRequest, NextResponse } from "next/server";
import { resultLockMessage } from "../../../../lib/resultApproval";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor } from "../../../../lib/labAccess";
import { writeAuditLog } from "../../../../lib/audit";
import { labSessions } from "../../../../lib/labSessions";
import { partScore, splitInstrument, unsplitInstrument, setDirectClo } from "../../../../lib/instrumentParts";
import { withErrors } from "../../../../lib/apiHandler";

// The lab's lead (the course instructor) brings the lab marks into their theory course's result, for institutes
// where the lab carries a share of the theory course's marks. The total of all lab sessions becomes the mark of one Lab item.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.labCourseId || !body.instrumentId) return NextResponse.json({ error: "choose the lab and the Lab item to fill" }, { status: 400 });
  const access = await labAccessFor(user, body.labCourseId);
  if (!access || access.as !== "LEAD") return NextResponse.json({ error: "only the lab's course instructor can import lab marks" }, { status: 403 });
  if (!access.theory || access.theory.instructorId !== user.id) return NextResponse.json({ error: "you can only import into a theory course that you teach" }, { status: 403 });
  { const locked = await resultLockMessage(access.theory.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); }

  const instrument = await prisma.assessmentInstrument.findFirst({ where: { id: body.instrumentId, courseId: access.theory.id, type: "Lab", source: "INSTRUCTOR" } });
  if (!instrument) return NextResponse.json({ error: "choose one of the Lab items of your theory course" }, { status: 404 });

  const marks = await prisma.labMark.findMany({ where: { courseId: access.lab.id } });
  if (marks.length === 0) return NextResponse.json({ error: "the Lab Engineer has not entered any marks yet" }, { status: 400 });
  // Each lab session counts at its own maximum; a student with no mark for a session scores 0 in it.
  const maxByLab = new Map<number, number>();
  for (const m of marks) maxByLab.set(m.labNumber, m.maxScore);
  const totalMax = Array.from(maxByLab.values()).reduce((a, b) => a + b, 0);
  const earned = new Map<string, number>();
  for (const m of marks) earned.set(m.studentId, (earned.get(m.studentId) || 0) + m.score);

  const theoryStudents = await prisma.studentEnrollment.findMany({ where: { courseId: access.theory.id, status: "ACTIVE" }, select: { studentId: true } });
  const inTheory = new Set<string>(theoryStudents.map((s) => s.studentId));

  // Which CLO each lab session (or each rubric criterion of it) measures; marks are kept apart per CLO.
  const sessions = await labSessions(access.lab.id).catch(() => []);
  const shareOf = (n: number) => {
    const s = sessions.find((x) => x.labNumber === n); const out = new Map<string | null, number>();
    if (s?.criteria) { const tot = s.criteria.reduce((t, c) => t + c.weight, 0) || 1; for (const c of s.criteria) { const k = c.cloId || s.cloId || null; out.set(k, (out.get(k) || 0) + c.weight / tot); } }
    else out.set(s?.cloId || null, 1);
    return out;
  };
  const levelsOf = new Map<string, Record<string, number>>();
  for (const m of marks as unknown as { studentId: string; labNumber: number; levelsJson?: string | null }[]) if (m.levelsJson) { try { levelsOf.set(`${m.studentId}:${m.labNumber}`, JSON.parse(m.levelsJson)); } catch { /* ignore */ } }
  const maxC = new Map<string | null, number>(), gotC = new Map<string, Map<string | null, number>>();
  for (const [n, mx] of Array.from(maxByLab.entries())) for (const [k, sh] of Array.from(shareOf(n).entries())) maxC.set(k, (maxC.get(k) || 0) + mx * sh);
  for (const m of marks) {
    const sess = sessions.find((x) => x.labNumber === m.labNumber); const lv = levelsOf.get(`${m.studentId}:${m.labNumber}`);
    const per = gotC.get(m.studentId) || new Map<string | null, number>();
    for (const [k, sh] of Array.from(shareOf(m.labNumber).entries())) {
      const frac = sess?.criteria && lv && k ? (partScore(sess.criteria.map((c) => ({ ...c, cloId: c.cloId || sess.cloId })), lv, k, 1) ?? m.score / (m.maxScore || 1)) : m.score / (m.maxScore || 1);
      per.set(k, (per.get(k) || 0) + frac * (m.maxScore || maxByLab.get(m.labNumber) || 0) * sh);
    }
    gotC.set(m.studentId, per);
  }
  const cloKeys = Array.from(maxC.keys()).filter((k): k is string => !!k && (maxC.get(k) || 0) > 0);

  let imported = 0, skipped = 0;
  if (cloKeys.length >= 2) {
    // Split the theory course's Lab item into one part per CLO (re-split when the lab's CLOs changed), then fill each part.
    const parts = await prisma.assessmentInstrument.findMany({ where: { partOfId: instrument.id } });
    const sameSet = parts.length === cloKeys.length && parts.every((p) => p.cloId && cloKeys.includes(p.cloId));
    if (!sameSet) {
      if (parts.length) { await prisma.studentMark.deleteMany({ where: { instrumentId: { in: parts.map((p) => p.id) } } }); await unsplitInstrument(access.theory.id, "INSTRUCTOR", instrument.id); }
      const fresh = await prisma.assessmentInstrument.findUnique({ where: { id: instrument.id } });
      const totMax = cloKeys.reduce((t, k) => t + (maxC.get(k) || 0), 0);
      let left = fresh?.marksPct || 0;
      const want = cloKeys.map((k, i) => { const pct = i === cloKeys.length - 1 ? Math.round(left * 10000) / 10000 : Math.round(((fresh?.marksPct || 0) * (maxC.get(k) || 0) / totMax) * 100) / 100; left -= pct; return { cloId: k, marksPct: pct }; });
      await prisma.studentMark.deleteMany({ where: { instrumentId: instrument.id } });
      const err = await splitInstrument(access.theory.id, "INSTRUCTOR", instrument.id, want);
      if (err) return NextResponse.json({ error: `Could not split the Lab item by CLO: ${err}` }, { status: 400 });
    }
    const now = await prisma.assessmentInstrument.findMany({ where: { partOfId: instrument.id } });
    for (const [studentId, per] of Array.from(gotC.entries())) {
      if (!inTheory.has(studentId)) { skipped++; continue; }
      for (const p of now) {
        const mx = maxC.get(p.cloId) || 0; if (!mx) continue;
        const score = Math.round(((per.get(p.cloId) || 0) / mx) * p.maxScore * 100) / 100;
        await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId, instrumentId: p.id } }, create: { studentId, courseId: access.theory.id, instrumentId: p.id, score, enteredById: user.id }, update: { score, enteredById: user.id } });
      }
      imported++;
    }
  } else {
    if (cloKeys.length === 1 && !(await prisma.assessmentInstrument.count({ where: { partOfId: instrument.id } }))) await setDirectClo(access.theory.id, "INSTRUCTOR", instrument.id, cloKeys[0]).catch(() => null);
    for (const [studentId, got] of Array.from(earned.entries())) {
      if (!inTheory.has(studentId)) { skipped++; continue; }
      const score = Math.round((got / totalMax) * instrument.maxScore * 100) / 100;
      await prisma.studentMark.upsert({
        where: { studentId_instrumentId: { studentId, instrumentId: instrument.id } },
        create: { studentId, courseId: access.theory.id, instrumentId: instrument.id, score, enteredById: user.id },
        update: { score, enteredById: user.id },
      });
      imported++;
    }
  }
  await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_IMPORTED", entityType: "Course", entityId: access.theory.id, metadata: { labCourseId: access.lab.id, instrumentId: instrument.id, imported, skipped } });
  return NextResponse.json({ ok: true, imported, skipped, byClo: cloKeys.length });
}
export const POST = withErrors(POST_handler);
