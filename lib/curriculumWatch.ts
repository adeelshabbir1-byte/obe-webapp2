import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { termIndex } from "./termLogic";

// Degree plans assume future batches follow today's curriculum (the newest batch of each program). When that curriculum
// changes — a course added, removed, or moved to another semester — the advisors of the program's batches are told, so
// they can re-plan the students who were counting on it. Checked when an advisor or planner page opens.

const cdb = prisma as unknown as Record<string, any>;
type Sig = Record<string, number>; // CODE -> semester

async function newestCurricula(chairmanId: string) {
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) } }, select: { id: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true } });
  const newest = new Map<string, (typeof batches)[number]>();
  for (const b of batches) {
    if (!/fall|spring/i.test(b.startTerm)) continue;
    const cur = newest.get(b.degreeProgram);
    if (!cur || termIndex(b.startTerm, b.startYear) > termIndex(cur.startTerm, cur.startYear)) newest.set(b.degreeProgram, b);
  }
  const out = new Map<string, { batch: (typeof batches)[number]; sig: Sig }>();
  for (const [program, b] of Array.from(newest.entries())) {
    const cs = await prisma.course.findMany({ where: { batchId: b.id }, select: { code: true, semesterNumber: true } });
    out.set(program, { batch: b, sig: Object.fromEntries(cs.map((c) => [c.code.trim().toUpperCase(), c.semesterNumber || 0])) });
  }
  return { out, batches };
}

export function diffSig(before: Sig, after: Sig) {
  const lines: string[] = [];
  for (const [c, s] of Object.entries(before)) {
    if (!(c in after)) lines.push(`${c} removed (was semester ${s})`);
    else if (after[c] !== s) lines.push(`${c} moved from semester ${s} to ${after[c]}`);
  }
  for (const [c, s] of Object.entries(after)) if (!(c in before)) lines.push(`${c} added in semester ${s}`);
  return lines;
}

/** Compare each program's current curriculum with the one last seen; notify advisors of changes. Returns the changes. */
export async function checkCurriculumChanges(chairmanId: string) {
  const changes: { program: string; lines: string[] }[] = [];
  let seen: { program: string; signatureJson: string }[] = [];
  try { seen = await cdb.curriculumWatch.findMany({ where: { chairmanId } }); } catch { return changes; }
  const { out, batches } = await newestCurricula(chairmanId);
  for (const [program, cur] of Array.from(out.entries())) {
    const row = seen.find((r) => r.program === program);
    const json = JSON.stringify(cur.sig);
    if (!row) { await cdb.curriculumWatch.create({ data: { id: randomUUID(), chairmanId, program, signatureJson: json, batchId: cur.batch.id, updatedAt: new Date() } }).catch(() => {}); continue; }
    if (row.signatureJson === json) continue;
    let before: Sig = {};
    try { before = JSON.parse(row.signatureJson); } catch { /* treat as empty */ }
    const lines = diffSig(before, cur.sig);
    await cdb.curriculumWatch.updateMany({ where: { chairmanId, program }, data: { signatureJson: json, batchId: cur.batch.id, updatedAt: new Date() } });
    if (!lines.length) continue;
    changes.push({ program, lines });
    const advisors = await prisma.batch.findMany({ where: { id: { in: batches.filter((b) => b.degreeProgram === program).map((b) => b.id) } }, select: { advisorId: true } });
    await notifyUsers(advisors.map((a) => a.advisorId), {
      kind: "CURRICULUM_CHANGED", title: `Curriculum changed — ${program}`,
      body: `Degree plans of ${program} students assume later batches follow the current curriculum (now ${cur.batch.batchName}). Changes:\n• ${lines.slice(0, 15).join("\n• ")}\nRe-plan students who were counting on these courses.`,
      href: "/advisor/dashboard",
    });
  }
  return changes;
}

/** For one student: remaining courses of their own curriculum that today's curriculum no longer has, or has elsewhere. */
export async function studentCurriculumGaps(studentId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, batch: { select: { degreeProgram: true, coordinator: { select: { managedById: true } } } } } });
  if (!s?.batch) return [];
  const { out } = await newestCurricula(s.batch.coordinator?.managedById || "");
  const cur = out.get(s.batch.degreeProgram);
  if (!cur || cur.batch.id === s.batchId) return [];
  const own = await prisma.course.findMany({ where: { batchId: s.batchId }, select: { code: true, semesterNumber: true } });
  const passed = new Set((await prisma.studentTranscriptRecord.findMany({ where: { studentId, OR: [{ gpaPoints: { gt: 0 } }, { grade: "P" }] }, select: { courseCode: true } })).map((r) => r.courseCode.trim().toUpperCase()));
  return own.filter((c) => !passed.has(c.code.trim().toUpperCase())).map((c) => {
    const k = c.code.trim().toUpperCase();
    return !(k in cur.sig) ? `${c.code} is not in today's curriculum (${cur.batch.batchName}) — no later batch will teach it` : cur.sig[k] !== c.semesterNumber ? `${c.code} is now taught in semester ${cur.sig[k]} (was ${c.semesterNumber})` : null;
  }).filter((x): x is string => !!x);
}
