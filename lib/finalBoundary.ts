import { prisma } from "./db";

/** How the Final paper's marks split between topics taught up to the midterm and topics after it. */
export async function computeFinalBoundary(courseId: string, source: "SE" | "INSTRUCTOR" = "SE") {
  const [course, rows, finals] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.lectureRow.findMany({ where: { courseId, source }, select: { id: true, week: true, topic: true, subtopic: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source, type: "Final" }, select: { id: true, marksPct: true } }),
  ]);
  const weeks = rows.map((r: { week: number }) => r.week);
  const maxWeek = weeks.length ? Math.max(...weeks) : 0;
  // Default: the week of a "midterm" topic (e.g. Midterm Review), otherwise half way through the semester.
  const marker = rows.find((r: { topic: string; subtopic: string | null }) => /mid\s*-?\s*term/i.test(`${r.topic} ${r.subtopic || ""}`));
  const defaultWeek = marker ? (marker as { week: number }).week : Math.ceil(maxWeek / 2);
  const midtermWeek = (course as unknown as { midtermWeek: number | null } | null)?.midtermWeek ?? defaultWeek;

  const links = finals.length ? await prisma.lectureRowInstrument.findMany({ where: { instrumentId: { in: finals.map((f: { id: string }) => f.id) } } }) : [];
  const weekOfRow = new Map<string, number>(rows.map((r: { id: string; week: number }) => [r.id, r.week]));
  let before = 0, after = 0, unlinked = 0;
  for (const f of finals as { id: string; marksPct: number }[]) {
    const ws = links.filter((l: { instrumentId: string }) => l.instrumentId === f.id).map((l: { lectureRowId: string }) => weekOfRow.get(l.lectureRowId)).filter((w): w is number => w !== undefined);
    if (ws.length === 0) { unlinked++; continue; }
    const b = ws.filter((w) => w <= midtermWeek).length / ws.length;
    before += f.marksPct * b; after += f.marksPct * (1 - b);
  }
  const total = before + after;
  return {
    midtermWeek, defaultWeek, maxWeek, unlinked,
    beforePct: total > 0 ? Math.round((before / total) * 1000) / 10 : null,
    afterPct: total > 0 ? Math.round((after / total) * 1000) / 10 : null,
  };
}
