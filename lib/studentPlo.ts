import { prisma } from "./db";

/** A student's PLO profile: average attainment per PLO over all transcript records, and how many courses fed it. */
export async function studentPloProfile(studentId: string) {
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { ploAttainmentJson: true } });
  const acc = new Map<string, number[]>();
  for (const r of recs) { let p: { label: string; pct: number }[] = []; try { p = JSON.parse(r.ploAttainmentJson); } catch { p = []; } for (const x of p) acc.set(x.label, [...(acc.get(x.label) || []), x.pct]); }
  return Array.from(acc.entries()).map(([label, v]) => ({ label, pct: Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10, courses: v.length }))
    .sort((a, b) => Number(a.label.replace(/\D/g, "")) - Number(b.label.replace(/\D/g, "")));
}
