import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { GE_REQS, pdb, UG_HINT } from "../../../lib/ugPolicy";
import { notifyUsers } from "../../../lib/notifications";
import { qdb, QUALITY_HINT, programsFor, canEditProgram, FACULTY_ITEMS, FACULTY_ROLES, POLICY_DEFAULTS, IPE_STANDARDS, INTL_KINDS, instituteOf, type PolicyRules } from "../../../lib/quality";
import { withErrors } from "../../../lib/apiHandler";

const str = (v: unknown, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown) => { const x = Number(v); return v === "" || v == null || !Number.isFinite(x) ? null : x; };

// One endpoint for the accreditation-gap tools. POST { action, ... }.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const a = String(b.action || "");
  const cid = await instituteOf(user);
  const ih = user.role === "CHAIRMAN";
  const program = async () => {
    const [coordinatorId, degreeProgram] = String(b.program || "").split("|");
    const p = (await programsFor(user)).find((x) => x.coordinatorId === coordinatorId && x.degreeProgram === degreeProgram);
    return p && canEditProgram(user, p.coordinatorId) ? p : null;
  };
  try {
    switch (a) {
      case "peoTarget": {
        const p = await program(); if (!p) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const peoLabel = str(b.peoLabel, 20); const target = Math.min(100, Math.max(0, num(b.target) ?? 70));
        const data = { target, actionTaken: str(b.actionTaken) || null, updatedAt: new Date() };
        await qdb.peoTarget.upsert({ where: { coordinatorId_degreeProgram_peoLabel: { coordinatorId: p.coordinatorId, degreeProgram: p.degreeProgram, peoLabel } }, create: { id: randomUUID(), coordinatorId: p.coordinatorId, degreeProgram: p.degreeProgram, peoLabel, ...data }, update: data });
        return NextResponse.json({ ok: true });
      }
      case "fsOpen": {
        if (!ih || !cid) return NextResponse.json({ error: "Only the Institute Head opens a faculty survey." }, { status: 403 });
        const title = str(b.title, 120) || `Faculty Survey ${new Date().getFullYear()}`;
        await qdb.facultySurveyRound.updateMany({ where: { chairmanId: cid, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
        await qdb.facultySurveyRound.create({ data: { id: randomUUID(), chairmanId: cid, title, status: "OPEN", openedById: user.id } });
        const staff = await prisma.user.findMany({ where: { managedById: cid, role: { in: FACULTY_ROLES } } as never, select: { id: true } });
        const lead = await prisma.user.findMany({ where: { managedById: { in: (await prisma.user.findMany({ where: { managedById: cid }, select: { id: true } })).map((u) => u.id) }, role: { in: FACULTY_ROLES } } as never, select: { id: true } });
        await notifyUsers([...staff, ...lead].map((u) => u.id), { kind: "SURVEY", title: `${title} is open — please answer (anonymous)`, href: "/faculty-survey" });
        return NextResponse.json({ ok: true });
      }
      case "fsClose": {
        if (!ih || !cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        await qdb.facultySurveyRound.updateMany({ where: { chairmanId: cid, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }
      case "fsAnswer": {
        if (!FACULTY_ROLES.includes(user.role) || !cid) return NextResponse.json({ error: "The faculty survey is for teaching staff." }, { status: 403 });
        const round = await qdb.facultySurveyRound.findFirst({ where: { chairmanId: cid, status: "OPEN" } });
        if (!round) return NextResponse.json({ error: "No faculty survey is open." }, { status: 400 });
        const answers: Record<string, number> = {};
        for (const [k] of FACULTY_ITEMS) { const v = num(b[`q_${k}`]); if (v && v >= 1 && v <= 5) answers[k] = Math.round(v); }
        if (Object.keys(answers).length < FACULTY_ITEMS.length / 2) return NextResponse.json({ error: "Please answer most of the questions." }, { status: 400 });
        const me = await prisma.user.findUnique({ where: { id: user.id }, select: { departmentId: true } }).catch(() => null);
        const data = { answersJson: JSON.stringify(answers), comment: str(b.comment) || null, departmentId: (me as { departmentId?: string | null } | null)?.departmentId || null, role: user.role };
        await qdb.facultySurveyAnswer.upsert({ where: { roundId_userId: { roundId: round.id, userId: user.id } }, create: { id: randomUUID(), roundId: round.id, userId: user.id, ...data }, update: data });
        return NextResponse.json({ ok: true });
      }
      case "policyRules": {
        if (!ih || !cid) return NextResponse.json({ error: "Only the Institute Head sets the policy limits." }, { status: 403 });
        const rules = Object.fromEntries(Object.keys(POLICY_DEFAULTS).map((k) => [k, num(b[k]) ?? POLICY_DEFAULTS[k as keyof PolicyRules]]));
        await qdb.policyRuleSet.upsert({ where: { chairmanId: cid }, create: { chairmanId: cid, rulesJson: JSON.stringify(rules), updatedAt: new Date() }, update: { rulesJson: JSON.stringify(rules), updatedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }
      case "aolGoal": {
        const p = await program(); if (!p) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const code = str(b.code, 20), text = str(b.text);
        if (!code || !text) return NextResponse.json({ error: "Give the goal a code (LG1) and its statement." }, { status: 400 });
        if (b.id) await qdb.aolGoal.updateMany({ where: { id: String(b.id), coordinatorId: p.coordinatorId }, data: { code, text } });
        else await qdb.aolGoal.create({ data: { id: randomUUID(), coordinatorId: p.coordinatorId, degreeProgram: p.degreeProgram, code, text } });
        return NextResponse.json({ ok: true });
      }
      case "aolObjective": {
        const p = await program(); if (!p) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const goal = await qdb.aolGoal.findFirst({ where: { id: String(b.goalId || ""), coordinatorId: p.coordinatorId } });
        if (!goal) return NextResponse.json({ error: "Goal not found." }, { status: 404 });
        const data = { code: str(b.code, 20), text: str(b.text), ploNumber: num(b.ploNumber), courseCode: str(b.courseCode, 40) || null, method: str(b.method, 200) || null, target: Math.min(100, Math.max(0, num(b.target) ?? 70)), measureYear: num(b.measureYear) };
        if (!data.code || !data.text) return NextResponse.json({ error: "Give the objective a code (LO1.1) and its statement." }, { status: 400 });
        if (b.id) await qdb.aolObjective.updateMany({ where: { id: String(b.id), goalId: goal.id }, data });
        else await qdb.aolObjective.create({ data: { id: randomUUID(), goalId: goal.id, ...data } });
        return NextResponse.json({ ok: true });
      }
      case "aolResult": {
        const p = await program(); if (!p) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const obj = await qdb.aolObjective.findUnique({ where: { id: String(b.objectiveId || "") } });
        const goal = obj ? await qdb.aolGoal.findFirst({ where: { id: obj.goalId, coordinatorId: p.coordinatorId } }) : null;
        if (!goal) return NextResponse.json({ error: "Objective not found." }, { status: 404 });
        const pct = num(b.attainedPct); if (pct == null || pct < 0 || pct > 100) return NextResponse.json({ error: "Attainment must be 0–100%." }, { status: 400 });
        await qdb.aolResult.create({ data: { id: randomUUID(), objectiveId: obj.id, term: str(b.term, 40) || String(new Date().getFullYear()), attainedPct: pct, sample: num(b.sample), closingLoop: str(b.closingLoop) || null, createdById: user.id } });
        return NextResponse.json({ ok: true });
      }
      case "aolDelete": {
        const p = await program(); if (!p) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        if (b.kind === "goal") { const g = await qdb.aolGoal.findFirst({ where: { id: String(b.id), coordinatorId: p.coordinatorId } }); if (g) { const os = await qdb.aolObjective.findMany({ where: { goalId: g.id }, select: { id: true } }); await qdb.aolResult.deleteMany({ where: { objectiveId: { in: os.map((o: { id: string }) => o.id) } } }); await qdb.aolObjective.deleteMany({ where: { goalId: g.id } }); await qdb.aolGoal.delete({ where: { id: g.id } }); } }
        if (b.kind === "objective") { const o = await qdb.aolObjective.findUnique({ where: { id: String(b.id) } }); if (o && (await qdb.aolGoal.count({ where: { id: o.goalId, coordinatorId: p.coordinatorId } }))) { await qdb.aolResult.deleteMany({ where: { objectiveId: o.id } }); await qdb.aolObjective.delete({ where: { id: o.id } }); } }
        return NextResponse.json({ ok: true });
      }
      case "ipe": {
        if ((!["CHAIRMAN", "DEAN"].includes(user.role) && !(user.extraRoles || []).some((x) => x === "QEC_INCHARGE" || x === "QEC_MEMBER")) || !cid) return NextResponse.json({ error: "The Institute Head, a Dean or the QEC fills the IPE self-assessment." }, { status: 403 });
        const standard = Math.round(num(b.standard) || 0);
        if (!IPE_STANDARDS.some(([n]) => n === standard)) return NextResponse.json({ error: "Unknown standard." }, { status: 400 });
        const score = num(b.score);
        const data = { score: score && score >= 1 && score <= 4 ? score : null, narrative: str(b.narrative, 8000) || null, evidence: str(b.evidence, 4000) || null, updatedById: user.id, updatedAt: new Date() };
        await qdb.ipeScore.upsert({ where: { chairmanId_standard: { chairmanId: cid, standard } }, create: { id: randomUUID(), chairmanId: cid, standard, ...data }, update: data });
        await writeAuditLog({ actorUserId: user.id, action: "IPE_UPDATED", entityType: "IpeScore", entityId: `${standard}` });
        return NextResponse.json({ ok: true });
      }
      case "intlAdd": {
        if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "STUDENT_AFFAIRS", "PROGRAM_COORDINATOR"].includes(user.role) || !cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const kind = INTL_KINDS.some(([k]) => k === b.kind) ? String(b.kind) : null; const title = str(b.title, 200);
        if (!kind || !title) return NextResponse.json({ error: "Choose the kind and give a title." }, { status: 400 });
        const d = (v: unknown) => { const x = v ? new Date(String(v)) : null; return x && !isNaN(x.getTime()) ? x : null; };
        await qdb.intlRecord.create({ data: { id: randomUUID(), chairmanId: cid, kind, title, partner: str(b.partner, 200) || null, country: str(b.country, 80) || null, startDate: d(b.startDate), endDate: d(b.endDate), people: num(b.people), note: str(b.note) || null, createdById: user.id } });
        return NextResponse.json({ ok: true });
      }
      case "policyMap": {
        // Mark which course meets which General Education requirement (HEC UG Policy 2023); "" clears, NONE = not General Education.
        const p = await program(); if (!p || !cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        const code = str(b.courseCode, 40), reqKey = str(b.requirement, 30);
        if (!code) return NextResponse.json({ error: "Choose a course." }, { status: 400 });
        if (reqKey && reqKey !== "NONE" && !GE_REQS.some((r) => r.key === reqKey)) return NextResponse.json({ error: "Unknown requirement." }, { status: 400 });
        if (!(await prisma.course.count({ where: { code, batch: { coordinatorId: p.coordinatorId, degreeProgram: p.degreeProgram } } }))) return NextResponse.json({ error: "This course is not in the program." }, { status: 404 });
        try {
          if (!reqKey) await pdb.policyCourseMap.deleteMany({ where: { chairmanId: cid, program: p.degreeProgram, courseCode: code } });
          else await pdb.policyCourseMap.upsert({ where: { chairmanId_program_courseCode: { chairmanId: cid, program: p.degreeProgram, courseCode: code } }, create: { id: randomUUID(), chairmanId: cid, program: p.degreeProgram, courseCode: code, requirement: reqKey, updatedById: user.id }, update: { requirement: reqKey, updatedById: user.id, updatedAt: new Date() } });
        } catch { return NextResponse.json({ error: UG_HINT }, { status: 500 }); }
        await writeAuditLog({ actorUserId: user.id, action: "UG_POLICY_COURSE_MARKED", entityType: "PolicyCourseMap", entityId: `${p.degreeProgram}|${code}`, metadata: { requirement: reqKey || "cleared" } });
        return NextResponse.json({ ok: true });
      }
      case "intlDelete": {
        if (!cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        await qdb.intlRecord.deleteMany({ where: { id: String(b.id || ""), chairmanId: cid, ...(ih ? {} : { createdById: user.id }) } });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|Cannot read prop|undefined/i.test(m) ? QUALITY_HINT : m.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
export const POST = withErrors(POST_handler);
