import crypto from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { holdersOf, notifyUsers } from "./notifications";
import { bestAttemptTotals } from "./cgpaMath";
import { getGradingScaleForBatch } from "./gradingScaleLookup";
import { getPassingCriteria } from "./passingCriteria";

// Final Year Projects. The department's Chairman names an FYP Head (any faculty member) and FYP Committee members.
// The Head opens a cycle (one per session) with its rules, milestones and rubric; faculty propose projects; the Head
// approves them; students form groups and apply; the proposer accepts a group and supervises it; the Head builds
// panels (with external examiners) and maps groups to them; supervisors, internal and external evaluators score
// each student on the rubric; the Head consolidates the results; the Chairman signs them off, which sends them to the
// Examination Department and onto the transcript. Groups that fall behind are flagged and can be given extensions.

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; name?: string };
export const db = prisma;

// ---------------------------------------------------------------------------
// Defaults and labels

export const MILESTONE_KINDS: Record<string, string> = { PROPOSAL_DEFENSE: "Proposal defense", MID_TERM: "Mid-term evaluation", FINAL: "Final evaluation", THESIS: "Camera-ready thesis", OTHER: "Other" };
export const DEFAULT_MILESTONES = [
  { kind: "PROPOSAL_DEFENSE", title: "Proposal defense", days: 30, weightPct: 10 },
  { kind: "MID_TERM", title: "Mid-term evaluation", days: 100, weightPct: 30 },
  { kind: "FINAL", title: "Final evaluation", days: 220, weightPct: 60 },
  { kind: "THESIS", title: "Camera-ready thesis submission", days: 235, weightPct: 0 },
];
// Mapped to the computing graduate attributes (NCEAC / HEC PLO numbering); the FYP Head can change any of it.
export const DEFAULT_RUBRIC = [
  { name: "Problem analysis", description: "Identifies and analyses the problem, requirements and constraints", bloomLevel: "C4", ploNumber: 3, appliesTo: "GROUP" },
  { name: "System design", description: "Designs a solution that meets the requirements; justifies the design choices", bloomLevel: "C5", ploNumber: 4, appliesTo: "GROUP" },
  { name: "Implementation and tools", description: "Builds and tests the system using modern tools and techniques", bloomLevel: "P5", ploNumber: 5, appliesTo: "GROUP" },
  { name: "Ethics and professional practice", description: "Licences, privacy, data and professional responsibility are handled properly", bloomLevel: "A3", ploNumber: 9, appliesTo: "INDIVIDUAL" },
  { name: "Teamwork and contribution", description: "The student's own share of the work and how they worked with the team", bloomLevel: "A4", ploNumber: 6, appliesTo: "INDIVIDUAL" },
  { name: "Technical presentation", description: "Clear, structured presentation; answers questions with understanding", bloomLevel: "A2", ploNumber: 7, appliesTo: "INDIVIDUAL" },
  { name: "Documentation", description: "Report / thesis: structure, accuracy, references and writing", bloomLevel: "C6", ploNumber: 7, appliesTo: "GROUP" },
];
export const DEFAULT_CUTOFFS = [
  { letter: "A", minPct: 85 }, { letter: "A-", minPct: 80 }, { letter: "B+", minPct: 75 }, { letter: "B", minPct: 71 }, { letter: "B-", minPct: 68 },
  { letter: "C+", minPct: 64 }, { letter: "C", minPct: 61 }, { letter: "C-", minPct: 58 }, { letter: "D+", minPct: 54 }, { letter: "D", minPct: 50 }, { letter: "F", minPct: 0 },
];
const FALLBACK_GPA: Record<string, number> = { A: 4, "A-": 3.67, "B+": 3.33, B: 3, "B-": 2.67, "C+": 2.33, C: 2, "C-": 1.67, "D+": 1.33, D: 1, F: 0 };
export const EXTENSIONS: Record<string, { label: string; days: number }> = { TWO_WEEKS: { label: "2 weeks", days: 14 }, FOUR_WEEKS: { label: "4 weeks", days: 28 }, SEMESTER: { label: "Next semester", days: 120 } };
export const REQUISITION_KINDS: Record<string, string> = { FUNDING: "Funding", HARDWARE: "Hardware components", LAB_EQUIPMENT: "Lab equipment", REIMBURSEMENT: "Reimbursement" };
export const ARTIFACT_KINDS: Record<string, string> = { THESIS_DRAFT: "Thesis draft", SIMILARITY_REPORT: "Similarity report (Turnitin / iThenticate)", REPOSITORY: "Code repository", DEMO_VIDEO: "Demo video", OTHER: "Other" };
export const ROLE_TEXT: Record<string, string> = { SUPERVISOR: "Supervisor", INTERNAL: "Internal panel", EXTERNAL: "External panel" };

export type Cutoff = { letter: string; minPct: number };
export const cutoffsOf = (c: { cutoffsJson: string }): Cutoff[] => { try { const x = JSON.parse(c.cutoffsJson); return Array.isArray(x) && x.length ? x : DEFAULT_CUTOFFS; } catch { return DEFAULT_CUTOFFS; } };
export const letterFor = (pct: number, cutoffs: Cutoff[]) => [...cutoffs].sort((a, b) => b.minPct - a.minPct).find((c) => pct >= c.minPct)?.letter || "F";

// ---------------------------------------------------------------------------
// Who may do what

/** The departments a staff member belongs to (their own, or their Program Lead's). */
export async function departmentsOf(userId: string): Promise<string[]> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true, managedBy: { select: { departmentId: true } } } });
  return Array.from(new Set([u?.departmentId, u?.managedBy?.departmentId].filter((x): x is string => !!x)));
}

export async function fypAccess(user: Who) {
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  // Before migration_fyp.sql has been run the table is missing; the pages then show their "not set up yet" notice.
  const staff = await prisma.fypStaff.findMany({ where: { userId: user.id, chairmanId } }).catch(() => []);
  const hodDept = user.role === "HEAD_OF_DEPARTMENT" ? user.departmentId || null : null;
  return {
    chairmanId,
    staff,
    hodDept,
    isInstituteHead: user.role === "CHAIRMAN",
    /** FYP Head or Committee member of this department. */
    manages: (departmentId: string) => staff.some((s) => s.departmentId === departmentId),
    isHead: (departmentId: string) => staff.some((s) => s.departmentId === departmentId && s.role === "HEAD"),
    /** The department Chairman (or the Institute Head) names the FYP Head and signs off results. */
    chairs: (departmentId: string) => user.role === "CHAIRMAN" || hodDept === departmentId,
  };
}
export type FypAccess = Awaited<ReturnType<typeof fypAccess>>;

/** Faculty who can be named FYP Head, supervise or sit on a panel: active teaching staff of the institute. */
export async function facultyOf(chairmanId: string, departmentId?: string | null) {
  const people = await prisma.user.findMany({
    where: {
      isActive: true, isVisitingPlaceholder: false,
      OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }],
      role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "OMC", "LAB_ENGINEER"] as never },
    },
    select: { id: true, name: true, departmentId: true, managedBy: { select: { departmentId: true } }, department_: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return people
    .map((p) => ({ id: p.id, name: p.name, departmentId: p.departmentId || p.managedBy?.departmentId || null, department: p.department_?.name || null }))
    .filter((p) => !departmentId || p.departmentId === departmentId);
}

// ---------------------------------------------------------------------------
// Students

/** CGPA and earned credit hours from the transcript (best attempt per course). */
export async function standingOf(studentId: string) {
  const records = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, creditHours: true, gpaPoints: true } });
  const { points, credits } = bestAttemptTotals(records);
  const passed = bestAttemptTotals(records.filter((r) => (r.gpaPoints ?? 0) > 0));
  return { cgpa: credits > 0 ? Math.round((points / credits) * 100) / 100 : null, earnedCredits: passed.credits };
}
export async function eligibility(studentId: string, cycle: { minCgpa: number; minCreditHours: number }) {
  const s = await standingOf(studentId);
  const reasons: string[] = [];
  if (s.earnedCredits < cycle.minCreditHours) reasons.push(`${s.earnedCredits} of the ${cycle.minCreditHours} credit hours needed are earned`);
  if (s.cgpa === null || s.cgpa < cycle.minCgpa) reasons.push(`CGPA ${s.cgpa ?? "—"} is below ${cycle.minCgpa}`);
  return { ...s, ok: reasons.length === 0, reasons };
}
/** The student's department (through their batch's Program Lead) and its open FYP cycle. */
export async function studentCycle(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, batch: { select: { coordinator: { select: { departmentId: true, managedById: true } } } } } });
  const departmentId = st?.batch.coordinator.departmentId;
  if (!departmentId) return null;
  return prisma.fypCycle.findFirst({ where: { departmentId, status: "OPEN" }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Evaluation

/** How this person may evaluate a group: as its supervisor, or as a member of its panel (never both). */
export async function evaluatorRoleFor(userId: string, group: { supervisorId: string | null; panelId: string | null }): Promise<"SUPERVISOR" | "INTERNAL" | null> {
  if (group.supervisorId === userId) return "SUPERVISOR";
  if (!group.panelId) return null;
  const m = await prisma.fypPanelMember.findFirst({ where: { panelId: group.panelId, userId, role: { in: ["CHAIR", "INTERNAL"] } } });
  return m ? "INTERNAL" : null;
}

type ScoreInput = { criterionId: string; studentId: string; score: number };
/** Saves one evaluator's scores for a group at a milestone (group criteria are given the same score for every member). */
export async function saveScores(input: { groupId: string; milestoneId: string; evaluatorKey: string; evaluatorRole: string; evaluatorName: string; scores: ScoreInput[]; comments?: string; recommendation?: string }) {
  const group = await prisma.fypGroup.findUnique({ where: { id: input.groupId } });
  if (!group) return { error: "group not found" };
  const [milestone, criteria, members] = await Promise.all([
    prisma.fypMilestone.findFirst({ where: { id: input.milestoneId, cycleId: group.cycleId } }),
    prisma.fypRubricCriterion.findMany({ where: { cycleId: group.cycleId } }),
    prisma.fypGroupMember.findMany({ where: { groupId: group.id, status: "JOINED" }, select: { studentId: true } }),
  ]);
  if (!milestone) return { error: "milestone not found" };
  if (milestone.weightPct <= 0) return { error: `${milestone.title} is a deadline, not an evaluation.` };
  if (group.status === "COMPLETED") return { error: "This group's results are signed off; the scores are locked." };
  const memberIds = new Set(members.map((m) => m.studentId));
  const crit = new Map(criteria.map((c) => [c.id, c]));
  for (const s of input.scores) {
    const c = crit.get(s.criterionId);
    if (!c || !memberIds.has(s.studentId)) return { error: "a score is for an unknown criterion or student" };
    if (!Number.isFinite(s.score) || s.score < 0 || s.score > c.maxScore) return { error: `${c.name}: scores must be between 0 and ${c.maxScore}` };
  }
  // A sheet is all or nothing: a partly-filled sheet would quietly count as a percentage of fewer criteria.
  const given = new Set(input.scores.map((s) => `${s.criterionId}|${s.studentId}`));
  if (criteria.some((c) => Array.from(memberIds).some((sid) => !given.has(`${c.id}|${sid}`)))) return { error: "Score every criterion for every student." };
  await prisma.$transaction(input.scores.map((s) => prisma.fypScore.upsert({
    where: { milestoneId_criterionId_studentId_evaluatorKey: { milestoneId: milestone.id, criterionId: s.criterionId, studentId: s.studentId, evaluatorKey: input.evaluatorKey } },
    create: { groupId: group.id, milestoneId: milestone.id, criterionId: s.criterionId, studentId: s.studentId, evaluatorKey: input.evaluatorKey, evaluatorRole: input.evaluatorRole, score: s.score },
    update: { score: s.score, evaluatorRole: input.evaluatorRole },
  })));
  const rec = input.recommendation === "AT_RISK" ? "AT_RISK" : "ON_TRACK";
  await prisma.fypEvaluation.upsert({
    where: { groupId_milestoneId_evaluatorKey: { groupId: group.id, milestoneId: milestone.id, evaluatorKey: input.evaluatorKey } },
    create: { groupId: group.id, milestoneId: milestone.id, evaluatorKey: input.evaluatorKey, evaluatorRole: input.evaluatorRole, evaluatorName: input.evaluatorName, comments: input.comments || null, recommendation: rec },
    update: { comments: input.comments || null, recommendation: rec, evaluatorName: input.evaluatorName },
  });
  // Early warning: an evaluator who finds the group behind flags it for the FYP Head and the supervisor.
  if (rec === "AT_RISK" && !group.atRisk) {
    await prisma.fypGroup.update({ where: { id: group.id }, data: { atRisk: true, riskNote: `${milestone.title}: ${input.comments || "flagged by " + input.evaluatorName}` } });
    const cycle = await prisma.fypCycle.findUnique({ where: { id: group.cycleId } });
    const heads = cycle ? (await prisma.fypStaff.findMany({ where: { departmentId: cycle.departmentId } })).map((s) => s.userId) : [];
    await notifyUsers([...heads, group.supervisorId], { kind: "FYP", title: `FYP group "${group.name}" flagged at the ${milestone.title}`, body: input.comments || "", href: `/fyp/groups/${group.id}` });
  }
  return { ok: true as const };
}

export type StudentResult = {
  studentId: string; name: string; rollNumber: string; groupId: string; groupName: string;
  totalPct: number | null; complete: boolean; grade: string | null;
  byMilestone: { milestoneId: string; title: string; weightPct: number; pct: number | null; byRole: Record<string, number | null> }[];
  plo: { label: string; pct: number; passed: boolean }[];
  missing: string[];
};

/** Every student's result from the scores so far: evaluators averaged per role, roles weighted by the cycle's split, milestones by their weight. */
export async function computeResults(cycleId: string): Promise<{ rows: StudentResult[]; passPct: number }> {
  const cycle = await prisma.fypCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return { rows: [], passPct: 50 };
  const [milestones, criteria, groups] = await Promise.all([
    prisma.fypMilestone.findMany({ where: { cycleId, weightPct: { gt: 0 } }, orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }] }),
    prisma.fypRubricCriterion.findMany({ where: { cycleId } }),
    prisma.fypGroup.findMany({ where: { cycleId, status: { in: ["ACTIVE", "COMPLETED"] } }, orderBy: { name: "asc" } }),
  ]);
  const passPct = (await getPassingCriteria(cycle.chairmanId)).cloPct;
  const members = await prisma.fypGroupMember.findMany({ where: { groupId: { in: groups.map((g) => g.id).concat(["none"]) }, status: "JOINED" } });
  const students = new Map((await prisma.student.findMany({ where: { id: { in: members.map((m) => m.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const scores = await prisma.fypScore.findMany({ where: { groupId: { in: groups.map((g) => g.id).concat(["none"]) } } });
  const crit = new Map(criteria.map((c) => [c.id, c]));
  const roleWeight: Record<string, number> = { SUPERVISOR: cycle.supervisorPct, INTERNAL: cycle.internalPct, EXTERNAL: cycle.externalPct };
  const cutoffs = cutoffsOf(cycle);
  const rows: StudentResult[] = [];
  for (const g of groups) {
    for (const m of members.filter((x) => x.groupId === g.id)) {
      const st = students.get(m.studentId);
      const mine = scores.filter((s) => s.studentId === m.studentId);
      const byMilestone = milestones.map((ms) => {
        const here = mine.filter((s) => s.milestoneId === ms.id);
        const byRole: Record<string, number | null> = { SUPERVISOR: null, INTERNAL: null, EXTERNAL: null };
        for (const role of Object.keys(byRole)) {
          const evaluators = Array.from(new Set(here.filter((s) => s.evaluatorRole === role).map((s) => s.evaluatorKey)));
          const pcts = evaluators.map((e) => {
            const ss = here.filter((s) => s.evaluatorKey === e);
            const max = ss.reduce((n, s) => n + (crit.get(s.criterionId)?.maxScore || 0), 0);
            return max > 0 ? (100 * ss.reduce((n, s) => n + s.score, 0)) / max : null;
          }).filter((x): x is number => x !== null);
          byRole[role] = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
        }
        const scored = Object.entries(byRole).filter(([r, v]) => v !== null && roleWeight[r] > 0);
        const w = scored.reduce((n, [r]) => n + roleWeight[r], 0);
        const pct = w > 0 ? scored.reduce((n, [r, v]) => n + (v as number) * roleWeight[r], 0) / w : null;
        return { milestoneId: ms.id, title: ms.title, weightPct: ms.weightPct, pct: pct === null ? null : Math.round(pct * 10) / 10, byRole: Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, v === null ? null : Math.round(v * 10) / 10])) };
      });
      const done = byMilestone.filter((x) => x.pct !== null);
      const wsum = done.reduce((n, x) => n + x.weightPct, 0);
      const total = wsum > 0 ? Math.round((done.reduce((n, x) => n + (x.pct as number) * x.weightPct, 0) / wsum) * 10) / 10 : null;
      const missing = byMilestone.filter((x) => x.pct === null).map((x) => x.title);
      // Missing roles on the evaluated milestones (e.g. no external score yet) are worth knowing before consolidating.
      for (const x of done) for (const [r, v] of Object.entries(x.byRole)) if (v === null && roleWeight[r] > 0) missing.push(`${x.title}: ${ROLE_TEXT[r].toLowerCase()}`);
      const ploMap = new Map<number, { got: number; max: number }>();
      for (const s of mine) {
        const c = crit.get(s.criterionId);
        if (!c?.ploNumber) continue;
        const e = ploMap.get(c.ploNumber) || { got: 0, max: 0 };
        e.got += s.score; e.max += c.maxScore;
        ploMap.set(c.ploNumber, e);
      }
      const plo = Array.from(ploMap.entries()).sort((a, b) => a[0] - b[0]).map(([n, e]) => { const pct = e.max ? Math.round((1000 * e.got) / e.max) / 10 : 0; return { label: `PLO-${n}`, pct, passed: pct >= passPct }; });
      const complete = missing.length === 0 && byMilestone.length > 0;
      rows.push({ studentId: m.studentId, name: st?.name || "", rollNumber: st?.rollNumber || "", groupId: g.id, groupName: g.name, totalPct: total, complete, grade: total === null ? null : letterFor(total, cutoffs), byMilestone, plo, missing });
    }
  }
  return { rows, passPct };
}

/** Every weighted milestone has a score, but some evaluator role is absent (e.g. no external at the mid-term). */
export const onlyRoleGaps = (r: StudentResult) => !r.complete && r.byMilestone.length > 0 && r.byMilestone.every((x) => x.pct !== null);

/**
 * The FYP Head consolidates: results are frozen for the students whose evaluation is complete (others are reported).
 * With allowRoleGaps, students whose milestones are all scored but miss an evaluator role are included too; the absent
 * role's share is spread over the roles that scored, and the result note says so.
 */
export async function consolidate(cycleId: string, user: Who, allowRoleGaps = false) {
  const cycle = await prisma.fypCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return { error: "cycle not found" };
  const { rows } = await computeResults(cycleId);
  const groups = new Map((await prisma.fypGroup.findMany({ where: { cycleId } })).map((g) => [g.id, g]));
  let saved = 0, held = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const g = groups.get(r.groupId);
    const gaps = allowRoleGaps && onlyRoleGaps(r);
    const onHold = !!g?.extendedUntil && g.extendedUntil > new Date() && !r.complete && !gaps;
    if (!r.complete && !gaps && !onHold) { skipped.push(`${r.name} (${r.missing.slice(0, 2).join("; ")})`); continue; }
    const existing = await prisma.fypResult.findUnique({ where: { cycleId_studentId: { cycleId, studentId: r.studentId } } });
    if (existing && existing.status === "APPROVED") continue; // signed off: never changed by a re-consolidation
    const data = {
      groupId: r.groupId, totalPct: r.totalPct ?? 0, grade: onHold ? "I" : r.grade || "F", gpaPoints: null,
      ploJson: JSON.stringify(r.plo), breakdownJson: JSON.stringify(r.byMilestone), status: onHold ? "HELD" : "CONSOLIDATED",
      note: onHold ? `Extension until ${g!.extendedUntil!.toISOString().slice(0, 10)}` : gaps ? `Consolidated without: ${r.missing.join("; ")} (shares re-weighted over the evaluators who scored).`.slice(0, 2000) : null,
      consolidatedById: user.id, consolidatedAt: new Date(),
    };
    await prisma.fypResult.upsert({ where: { cycleId_studentId: { cycleId, studentId: r.studentId } }, create: { cycleId, studentId: r.studentId, ...data }, update: data });
    if (onHold) held++; else saved++;
  }
  if (saved) {
    const chairs = await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: cycle.departmentId, isActive: true }, select: { id: true } });
    await notifyUsers(chairs.map((c) => c.id), { kind: "FYP", title: `FYP results ready for your sign-off: ${cycle.title}`, body: `${saved} student result(s) consolidated by the FYP Head.`, href: `/fyp/manage?cycle=${cycle.id}&tab=results`, exceptId: user.id });
  }
  return { saved, held, skipped };
}

/** The department Chairman approves (results go to the Examination Department and the transcript) or returns them. */
export async function signOff(cycleId: string, user: Who, approve: boolean, note: string) {
  const cycle = await prisma.fypCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return { error: "cycle not found" };
  const pending = await prisma.fypResult.findMany({ where: { cycleId, status: "CONSOLIDATED" } });
  if (!pending.length) return { error: "No consolidated results are waiting for sign-off." };
  const staff = (await prisma.fypStaff.findMany({ where: { departmentId: cycle.departmentId } })).map((s) => s.userId);
  if (!approve) {
    if (note.trim().length < 3) return { error: "Say what needs to change." };
    await prisma.fypResult.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "RETURNED", note: note.trim().slice(0, 2000) } });
    await notifyUsers(staff, { kind: "FYP", title: `FYP results returned: ${cycle.title}`, body: note, href: `/fyp/manage?cycle=${cycle.id}&tab=results`, exceptId: user.id });
    return { returned: pending.length };
  }
  const now = new Date();
  const students = await prisma.student.findMany({ where: { id: { in: pending.map((p) => p.studentId) } }, select: { id: true, batch: { select: { coordinatorId: true, startTerm: true, startYear: true } } } });
  const byStudent = new Map(students.map((s) => [s.id, s]));
  const scales = new Map<string, Awaited<ReturnType<typeof getGradingScaleForBatch>>>();
  for (const r of pending) {
    const st = byStudent.get(r.studentId);
    if (!st) continue;
    const key = `${st.batch.coordinatorId}|${st.batch.startTerm}|${st.batch.startYear}`;
    if (!scales.has(key)) scales.set(key, await getGradingScaleForBatch(st.batch.coordinatorId, st.batch));
    const scale = scales.get(key)!;
    const gpa = scale.find((s) => s.letter === r.grade)?.gpaValue ?? FALLBACK_GPA[r.grade] ?? null;
    await prisma.$transaction([
      prisma.fypResult.update({ where: { id: r.id }, data: { status: "APPROVED", gpaPoints: gpa, approvedById: user.id, approvedAt: now, submittedAt: now, note: note.trim() || null } }),
      // The transcript (and the student's OBE dashboard, which reads it) gets the FYP grade and its PLO attainment.
      prisma.studentTranscriptRecord.deleteMany({ where: { studentId: r.studentId, courseCode: cycle.courseCode, termName: cycle.termName, termYear: cycle.termYear } }),
      prisma.studentTranscriptRecord.create({
        data: {
          studentId: r.studentId, coordinatorId: st.batch.coordinatorId, courseCode: cycle.courseCode, courseTitle: cycle.courseTitle, creditHours: cycle.creditHours,
          courseType: "Capstone Project", termName: cycle.termName, termYear: cycle.termYear, totalPct: r.totalPct, grade: r.grade, gpaPoints: gpa,
          cloAttainmentJson: "[]", ploAttainmentJson: r.ploJson,
        },
      }),
    ]);
  }
  // Electronic submission to the Examination Department (the Institute Head's exam office).
  await notifyUsers([cycle.chairmanId, ...(await holdersOf(cycle.chairmanId, "CHAIRMAN"))], { kind: "FYP", title: `FYP results received: ${cycle.title}`, body: `${pending.length} approved result(s) were submitted to the Examination Department and posted to the transcripts.`, href: "/fyp/exams", exceptId: user.id });
  await notifyUsers(staff, { kind: "FYP", title: `FYP results approved: ${cycle.title}`, body: `${pending.length} result(s) signed off and sent to the Examination Department.`, href: `/fyp/manage?cycle=${cycle.id}&tab=results`, exceptId: user.id });
  await prisma.fypGroup.updateMany({ where: { cycleId, id: { in: Array.from(new Set(pending.map((p) => p.groupId))) } }, data: { status: "COMPLETED" } });
  return { approved: pending.length };
}

// ---------------------------------------------------------------------------
// Panels

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Panel members who have marked themselves unavailable at the panel's session time. */
export async function panelAvailability(panelId: string) {
  const panel = await prisma.fypPanel.findUnique({ where: { id: panelId } });
  if (!panel?.sessionAt) return [];
  const members = await prisma.fypPanelMember.findMany({ where: { panelId, userId: { not: null } } });
  const day = DAY[panel.sessionAt.getUTCDay()], hour = panel.sessionAt.getUTCHours();
  const blocks = await prisma.facultyUnavailability.findMany({ where: { facultyId: { in: members.map((m) => m.userId!) }, dayOfWeek: day } });
  return members.filter((m) => blocks.some((b) => b.facultyId === m.userId && hour >= b.startHour && hour < b.endHour)).map((m) => m.userId!);
}

const words = (t: string) => new Set((t || "").toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 2));
const overlap = (a: string, b: string) => { const A = words(a), B = words(b); let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n; };

/**
 * Maps groups to panels: never a panel the group's supervisor sits on (a supervisor does not examine their own group),
 * panels whose domain matches the project's come first, panels with an unavailable member come last, and the load is
 * kept even. Returns the groups that could not be placed.
 */
export async function autoAssignPanels(cycleId: string, onlyUnassigned = true) {
  const panels = await prisma.fypPanel.findMany({ where: { cycleId } });
  const [members, groups] = await Promise.all([
    prisma.fypPanelMember.findMany({ where: { panelId: { in: panels.map((p) => p.id).concat(["none"]) } } }),
    prisma.fypGroup.findMany({ where: { cycleId, status: "ACTIVE", ...(onlyUnassigned ? { panelId: null } : {}) } }),
  ]);
  if (!panels.length) return { error: "Create at least one panel first." };
  const proposals = new Map((await prisma.fypProposal.findMany({ where: { id: { in: groups.map((g) => g.proposalId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, title: true, domain: true } })).map((p) => [p.id, p]));
  const unavailable = new Map<string, number>();
  for (const p of panels) unavailable.set(p.id, (await panelAvailability(p.id)).length);
  const load = new Map(panels.map((p) => [p.id, 0]));
  if (onlyUnassigned) for (const g of await prisma.fypGroup.findMany({ where: { cycleId, panelId: { not: null } }, select: { panelId: true } })) load.set(g.panelId!, (load.get(g.panelId!) || 0) + 1);
  const cap = Math.ceil((groups.length + Array.from(load.values()).reduce((a, b) => a + b, 0)) / panels.length) + 1;
  const insiders = (panelId: string) => members.filter((m) => m.panelId === panelId && m.userId).map((m) => m.userId!);
  const options = groups.map((g) => ({ g, ok: panels.filter((p) => !g.supervisorId || !insiders(p.id).includes(g.supervisorId)) }));
  options.sort((a, b) => a.ok.length - b.ok.length); // the most constrained groups first
  const unplaced: string[] = [];
  const updates: { id: string; panelId: string }[] = [];
  for (const { g, ok } of options) {
    const prop = g.proposalId ? proposals.get(g.proposalId) : null;
    const text = `${prop?.domain || ""} ${prop?.title || ""}`;
    const ranked = ok.filter((p) => (load.get(p.id) || 0) < cap).sort((x, y) =>
      (unavailable.get(x.id)! > 0 ? 1 : 0) - (unavailable.get(y.id)! > 0 ? 1 : 0)
      || overlap(text, `${y.domain || ""} ${y.name}`) - overlap(text, `${x.domain || ""} ${x.name}`)
      || (load.get(x.id) || 0) - (load.get(y.id) || 0));
    const pick = ranked[0];
    if (!pick) { unplaced.push(g.name); continue; }
    load.set(pick.id, (load.get(pick.id) || 0) + 1);
    updates.push({ id: g.id, panelId: pick.id });
  }
  if (updates.length) await prisma.$transaction(updates.map((u) => prisma.fypGroup.update({ where: { id: u.id }, data: { panelId: u.panelId } })));
  return { assigned: updates.length, unplaced };
}

/** A link for an external evaluator: shown once; only its hash is kept. */
export function newExternalToken() {
  const raw = crypto.randomBytes(24).toString("hex");
  return { raw, hash: crypto.createHash("sha256").update(raw).digest("hex") };
}
export async function externalByToken(raw: string) {
  if (!/^[a-f0-9]{48}$/.test(raw || "")) return null;
  const ext = await prisma.fypExternal.findUnique({ where: { tokenHash: crypto.createHash("sha256").update(raw).digest("hex") } });
  return ext && ext.expiresAt > new Date() ? ext : null;
}

// ---------------------------------------------------------------------------
// Extensions

export async function grantExtension(groupId: string, user: Who, input: { kind: string; reason: string; followUpAt?: string | null }) {
  const group = await prisma.fypGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "group not found" };
  const ext = EXTENSIONS[input.kind];
  if (!ext) return { error: "Choose the length of the extension." };
  if ((input.reason || "").trim().length < 10) return { error: "Record the reason for the extension." };
  const final = await prisma.fypMilestone.findFirst({ where: { cycleId: group.cycleId, kind: { in: ["FINAL", "THESIS"] } }, orderBy: { dueDate: "desc" } });
  const base = group.extendedUntil && (!final || group.extendedUntil > final.dueDate) ? group.extendedUntil : final?.dueDate || new Date();
  const newDue = new Date(base.getTime() + ext.days * 86400000);
  const followUp = input.followUpAt && /^\d{4}-\d{2}-\d{2}/.test(input.followUpAt) ? new Date(input.followUpAt) : null;
  await prisma.$transaction([
    prisma.fypExtension.create({ data: { groupId, kind: input.kind, previousDue: base, newDueDate: newDue, reason: input.reason.trim().slice(0, 3000), followUpAt: followUp, grantedById: user.id } }),
    prisma.fypGroup.update({ where: { id: groupId }, data: { extendedUntil: newDue } }),
    // A result already consolidated (not signed off) is held until the re-evaluation.
    prisma.fypResult.updateMany({ where: { groupId, status: { in: ["CONSOLIDATED", "RETURNED"] } }, data: { status: "HELD", grade: "I", note: `Extension until ${newDue.toISOString().slice(0, 10)}` } }),
  ]);
  const cycle = await prisma.fypCycle.findUnique({ where: { id: group.cycleId } });
  if (cycle) {
    await notifyUsers([cycle.chairmanId, group.supervisorId], {
      kind: "FYP", title: `FYP grade hold: group "${group.name}" extended to ${newDue.toISOString().slice(0, 10)}`,
      body: `${ext.label} extension. Reason: ${input.reason.trim()}${followUp ? ` Follow-up panel: ${followUp.toISOString().slice(0, 10)}.` : ""}`, href: "/fyp/exams", exceptId: user.id,
    });
  }
  return { newDueDate: newDue };
}
