import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";

// Moderation extras on top of internal moderation (paper vetting by the Program Lead, OMC paper approval, result
// approval): a vetting checklist recorded with every decision, a check that a paper does not repeat past papers, a
// temporary pass for an external examiner to vet final papers and results, and one log of everything that was vetted.

export const mdb = prisma as unknown as Record<string, any>;
export const MOD_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];
export const MOD_HINT = "External examiners and the vetting checklist need prisma/migration_moderation.sql — run it in Supabase.";

/* ---------------- Repeats from past papers ---------------- */

const STOP = new Set("the a an of to and or in on for with by is are be as at from that this which what how why explain describe write give find show using use your following each its it".split(" "));
const words = (s: string) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
export function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (A.size < 5 || B.size < 5) return 0;
  let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}
export const REPEAT_AT = 0.55;
export type Repeat = { question: string; past: string; pastQuestion: string; similarity: number };

/** Questions of this paper that look like a question of a past paper of the same course (other offerings or batches). */
export async function repeatCheck(courseId: string, examType: string): Promise<Repeat[]> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, coordinatorId: true } });
  if (!course) return [];
  const mine = (await mdb.paperVetting.findUnique({ where: { courseId_examType: { courseId, examType } } }).catch(() => null)) as { questionsJson: string } | null;
  const qs = Object.values(JSON.parse(mine?.questionsJson || "{}") as Record<string, string>).filter((t) => t.trim());
  if (!qs.length) return [];
  const others = await prisma.course.findMany({ where: { code: course.code, id: { not: courseId }, coordinator: { managedById: (await prisma.user.findUnique({ where: { id: course.coordinatorId }, select: { managedById: true } }))?.managedById || "none" } }, select: { id: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true } } } });
  const past = (await mdb.paperVetting.findMany({ where: { courseId: { in: others.map((o) => o.id).concat(["none"]) } } }).catch(() => [])) as { courseId: string; examType: string; questionsJson: string }[];
  const out: Repeat[] = [];
  qs.forEach((q, i) => {
    let best: Repeat | null = null;
    for (const p of past) {
      const o = others.find((x) => x.id === p.courseId);
      for (const [, t] of Object.entries(JSON.parse(p.questionsJson || "{}") as Record<string, string>)) {
        const s = similarity(q, t);
        if (s >= REPEAT_AT && (!best || s > best.similarity)) best = { question: `Q${i + 1}`, past: `${p.examType} paper, ${o?.batch?.batchName || ""}${o?.offeredTermName ? ` (${o.offeredTermName} ${o.offeredTermYear})` : ""}`, pastQuestion: t.slice(0, 160), similarity: Math.round(s * 100) };
      }
    }
    if (best) out.push(best);
  });
  return out;
}

/* ---------------- The vetting checklist ---------------- */

export type CheckItem = { key: string; label: string; auto: boolean; ok: boolean | null; note?: string };
/** CLO coverage, Bloom balance and marks distribution come from the system check; repeats from the past papers;
 *  clarity is the vetter's own judgement. */
export function checklistOf(systemJson: string | null, repeats: Repeat[], clarity: boolean | null): CheckItem[] {
  const f = systemJson ? ((JSON.parse(systemJson) as { findings: { level: string; text: string }[] }).findings || []) : [];
  const has = (re: RegExp) => f.filter((x) => x.level !== "ok" && re.test(x.text));
  const clo = has(/not mapped to a CLO|not assessed in this paper|not taught before/), bloom = has(/Bloom|recall|C3 or above/), dist = has(/carries \d+% of the paper/);
  return [
    { key: "clo", label: "Every CLO taught is covered and every question is mapped to a CLO", auto: true, ok: systemJson ? !clo.length : null, note: clo.map((x) => x.text).join(" ") || undefined },
    { key: "bloom", label: "Bloom levels are balanced and each question reaches its CLO's level", auto: true, ok: systemJson ? !bloom.length : null, note: bloom.map((x) => x.text).join(" ") || undefined },
    { key: "marks", label: "Marks are spread sensibly across CLOs and questions", auto: true, ok: systemJson ? !dist.length : null, note: dist.map((x) => x.text).join(" ") || undefined },
    { key: "repeats", label: "No question repeats a past paper", auto: true, ok: !repeats.length, note: repeats.length ? repeats.map((r) => `${r.question} looks like a question of the ${r.past} (${r.similarity}% the same words)`).join("; ") : undefined },
    { key: "clarity", label: "Questions are clear, unambiguous and free of errors", auto: false, ok: clarity },
  ];
}

/* ---------------- External examiners ---------------- */

export type Examiner = { id: string; chairmanId: string; name: string; email: string; organisation: string | null; designation: string | null; courseIdsJson: string; expiresAt: Date; revokedAt: Date | null; createdById: string; createdAt: Date };
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export async function createExaminer(e: { chairmanId: string; name: string; email: string; organisation?: string; designation?: string; courseIds: string[]; days: number; by: string }) {
  const token = randomBytes(24).toString("base64url");
  await mdb.externalExaminer.create({ data: { id: randomUUID(), chairmanId: e.chairmanId, name: e.name.slice(0, 120), email: e.email.slice(0, 160), organisation: e.organisation?.slice(0, 160) || null, designation: e.designation?.slice(0, 120) || null, courseIdsJson: JSON.stringify(e.courseIds.slice(0, 40)), tokenHash: hash(token), expiresAt: new Date(Date.now() + Math.min(Math.max(e.days, 1), 60) * 864e5), createdById: e.by } });
  return token;
}
export async function examinerByToken(token: string): Promise<Examiner | null> {
  try {
    const x = (await mdb.externalExaminer.findUnique({ where: { tokenHash: hash(token) } })) as Examiner | null;
    return x && !x.revokedAt && new Date(x.expiresAt) > new Date() ? x : null;
  } catch { return null; }
}
export async function examinersOf(chairmanId: string) {
  try { return (await mdb.externalExaminer.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 50 })) as Examiner[]; } catch { return null; }
}

/* ---------------- Remarks (internal checklists and external examiners) ---------------- */

export type Remark = { id: string; chairmanId: string; kind: string; courseId: string; examType: string | null; round: number | null; byKind: string; byUserId: string | null; examinerId: string | null; decision: string; comments: string | null; checklistJson: string | null; createdAt: Date };
export async function addRemark(r: Omit<Remark, "id" | "createdAt">) {
  await mdb.moderationRemark.create({ data: { id: randomUUID(), ...r } });
}

/* ---------------- The moderation log ---------------- */

export type LogRow = { at: Date; course: string; courseId: string; what: string; who: string; decision: string; comments: string; changes: string };
/** Every paper and result vetted for these courses: who, when, what they said and what changed. */
export async function moderationLog(courseIds: string[]): Promise<LogRow[]> {
  const ids = courseIds.concat(["none"]);
  const courses = await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true, batch: { select: { batchName: true } } } });
  const label = (id: string) => { const c = courses.find((x) => x.id === id); return c ? `${c.code} ${c.title}${c.batch ? ` (${c.batch.batchName})` : ""}` : id; };
  const [vets, results, changes, remarks] = await Promise.all([
    mdb.paperVetting.findMany({ where: { courseId: { in: ids }, decidedAt: { not: null } } }).catch(() => []) as Promise<{ courseId: string; examType: string; status: string; reviewerId: string | null; reviewNote: string | null; decidedAt: Date; round: number; submittedAt: Date | null }[]>,
    mdb.courseResult.findMany({ where: { courseId: { in: ids }, decidedAt: { not: null } } }).catch(() => []) as Promise<{ courseId: string; status: string; decidedById: string | null; decidedAt: Date; note: string | null; termName: string | null; termYear: number | null }[]>,
    mdb.gradeChangeRequest.findMany({ where: { courseId: { in: ids }, decidedAt: { not: null } } }).catch(() => []) as Promise<{ courseId: string; studentId: string; oldGrade: string; newGrade: string; status: string; decidedById: string | null; decidedAt: Date; decisionNote: string | null; reason: string }[]>,
    mdb.moderationRemark.findMany({ where: { courseId: { in: ids } } }).catch(() => []) as Promise<Remark[]>,
  ]);
  const examiners = (await mdb.externalExaminer.findMany({ where: { id: { in: remarks.map((r) => r.examinerId).filter((x): x is string => !!x).concat(["none"]) } } }).catch(() => [])) as Examiner[];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [...vets.map((v) => v.reviewerId), ...results.map((r) => r.decidedById), ...changes.map((c) => c.decidedById), ...remarks.map((r) => r.byUserId)].filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const students = new Map((await prisma.student.findMany({ where: { id: { in: changes.map((c) => c.studentId).concat(["none"]) } }, select: { id: true, rollNumber: true } })).map((s) => [s.id, s.rollNumber]));
  const out: LogRow[] = [];
  for (const v of vets) {
    const rm = remarks.find((r) => r.kind === "PAPER" && r.byKind === "INTERNAL" && r.courseId === v.courseId && r.examType === v.examType && r.round === v.round);
    const cl = rm?.checklistJson ? (JSON.parse(rm.checklistJson) as CheckItem[]) : [];
    out.push({ at: v.decidedAt, course: label(v.courseId), courseId: v.courseId, what: `${v.examType} paper vetted (round ${v.round})`, who: people.get(v.reviewerId || "") || "—", decision: v.status === "APPROVED" ? "Approved" : v.status === "RETURNED" ? "Returned for changes" : v.status, comments: v.reviewNote || "", changes: cl.length ? `Checklist: ${cl.map((c) => `${c.label.split(" ").slice(0, 3).join(" ")} ${c.ok === true ? "yes" : c.ok === false ? "no" : "—"}`).join("; ")}` : (v.round > 1 ? `Revised ${v.round - 1} time(s)` : "") });
  }
  for (const r of results) out.push({ at: r.decidedAt, course: label(r.courseId), courseId: r.courseId, what: `Result${r.termName ? ` ${r.termName} ${r.termYear}` : ""} reviewed`, who: people.get(r.decidedById || "") || "—", decision: r.status === "APPROVED" ? "Approved" : r.status === "RETURNED" ? "Returned" : r.status, comments: r.note || "", changes: "" });
  for (const c of changes) out.push({ at: c.decidedAt, course: label(c.courseId), courseId: c.courseId, what: "Grade change", who: people.get(c.decidedById || "") || "—", decision: c.status === "APPROVED" ? "Approved" : c.status === "REJECTED" ? "Rejected" : c.status, comments: c.decisionNote || c.reason, changes: `${students.get(c.studentId) || "student"}: ${c.oldGrade} → ${c.newGrade}` });
  for (const r of remarks.filter((x) => x.byKind === "EXTERNAL")) {
    const ex = examiners.find((e) => e.id === r.examinerId);
    out.push({ at: r.createdAt, course: label(r.courseId), courseId: r.courseId, what: `External examiner: ${r.kind === "PAPER" ? `${r.examType || "final"} paper` : "result"}`, who: ex ? `${ex.name}${ex.organisation ? `, ${ex.organisation}` : ""}` : "External examiner", decision: r.decision === "OK" ? "Satisfactory" : "Changes suggested", comments: r.comments || "", changes: "" });
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
