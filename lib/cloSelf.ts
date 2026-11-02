import { randomUUID } from "crypto";
import { prisma } from "./db";
import { compare } from "./cloSelfCore";

const db = prisma as unknown as Record<string, any>;
export const SELF_HINT = "Run prisma/migration_adeel_p11.sql in Supabase first.";

/** The CLOs of a student's active course, with his ratings so far. */
export async function myForm(studentId: string, courseId: string) {
  const en = await prisma.studentEnrollment.findFirst({ where: { studentId, courseId }, select: { course: { select: { id: true, code: true, title: true } } } });
  if (!en) return null;
  const own = await prisma.cLO.count({ where: { courseId, source: "INSTRUCTOR" } });
  const clos = await prisma.cLO.findMany({ where: { courseId, source: own ? "INSTRUCTOR" : "SE" }, orderBy: { orderIndex: "asc" }, select: { code: true, statement: true } });
  const mine = ((await db.cloSelfRating?.findMany({ where: { studentId, courseId } }).catch(() => [])) || []) as { cloCode: string; rating: number }[];
  return { course: en.course, clos: clos.map((c) => ({ ...c, rating: mine.find((m) => m.cloCode === c.code)?.rating ?? null })) };
}
export async function saveMine(studentId: string, courseId: string, ratings: Record<string, number>) {
  if (!db.cloSelfRating) throw new Error(SELF_HINT);
  const f = await myForm(studentId, courseId);
  if (!f) throw new Error("Not your course.");
  for (const c of f.clos) {
    const r = Math.round(Number(ratings[c.code])); if (!(r >= 1 && r <= 5)) continue;
    await db.cloSelfRating.upsert({ where: { studentId_courseId_cloCode: { studentId, courseId, cloCode: c.code } }, create: { id: randomUUID(), studentId, courseId, cloCode: c.code, rating: r }, update: { rating: r, createdAt: new Date() } });
  }
  return { ok: true };
}
/** For the teacher / OMC: per CLO, students' confidence beside the class's direct average. */
export async function courseSelf(courseId: string) {
  const rows = ((await db.cloSelfRating?.findMany({ where: { courseId } }).catch(() => [])) || []) as { studentId: string; cloCode: string; rating: number }[];
  const { courseCloResults } = await import("./cloMethods");
  const r = await courseCloResults(courseId).catch(() => null);
  const direct = new Map<string, number | null>((r?.clos || []).map((c): [string, number | null] => [(c.clo as { code: string }).code, (c as { assessed?: number; avgPct?: number }).assessed ? Number((c as { avgPct?: number }).avgPct) : null]));
  const codes: string[] = Array.from(new Set<string>([...Array.from(direct.keys()), ...rows.map((x) => x.cloCode)])).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
  return { students: new Set(rows.map((x) => x.studentId)).size, clos: codes.map((code) => ({ code, ...compare(rows.filter((x) => x.cloCode === code).map((x) => x.rating), direct.get(code) ?? null) })) };
}
