import { NextRequest, NextResponse } from "next/server";
import { schemeAccess } from "../../../lib/degreeScheme";
import { planLock } from "../../../lib/registrationRules";
import { applyPlan, loadPlanInput, planDegree, policyCap, saveLoads, timeline, PLANNER_HINT } from "../../../lib/degreePlanner";
import { createRequest, requestsOfStudent, KINDS, termKeyLabel } from "../../../lib/planRequests";
import { studentCurriculumGaps } from "../../../lib/curriculumWatch";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 60;

// GET ?studentId= — the generated plan with the loads saved for the student, the load form, requests and curriculum notes.
async function GET_handler(req: NextRequest) {
  const access = await schemeAccess(req.nextUrl.searchParams.get("studentId"));
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const inp = await loadPlanInput(access.studentId);
  if (!inp) return NextResponse.json({ error: "student not found" }, { status: 404 });
  const plan = planDegree(inp);
  // The load form: the next terms, with the policy's limit for each and what was typed.
  let sem = inp.studentSemAtStart - 1;
  const form = timeline(inp.startReg, inp.startWithSummer).slice(0, 18).map((t) => {
    if (!t.summer) sem++;
    return { key: t.key, label: t.label, summer: t.summer, studentSem: t.summer ? null : sem, limit: policyCap(inp, t, t.summer ? null : sem), typed: inp.loads[t.key] ?? null };
  });
  const [requests, gaps] = await Promise.all([requestsOfStudent(access.studentId), studentCurriculumGaps(access.studentId).catch(() => [])]);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: requests.flatMap((r) => [r.requestedById, r.decidedById || ""]).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return NextResponse.json({
    editedBy: access.by, locked: !!(await planLock(access.studentId)),
    student: { name: inp.name, roll: inp.roll, program: inp.program, cgpa: inp.cgpa, lowCgpa: inp.lowCgpa },
    policy: { summer: inp.policy.maxCreditsSummer, lowCgpa: inp.policy.maxCreditsLowCgpa, normal: inp.policy.maxCreditsNormal, threshold: inp.policy.lowCgpaThreshold },
    form, plan, curriculumNotes: gaps,
    courses: inp.courses.map((c) => ({ code: c.code, title: c.title, sem: c.sem })),
    requests: requests.map((r) => ({ id: r.id, kind: KINDS[r.kind]?.label || r.kind, courseCode: r.courseCode, term: r.termKey ? termKeyLabel(r.termKey) : null, status: r.status, by: names.get(r.requestedById) || "", decidedBy: r.decidedById ? names.get(r.decidedById) || "" : null, note: r.note, decisionNote: r.decisionNote, at: r.createdAt })),
  });
}

// POST { studentId?, action: "loads", loads } | { action: "apply", loads? } | { action: "request", kind, courseCode?, termKey?, note? }
async function POST_handler(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const access = await schemeAccess(b.studentId ? String(b.studentId) : null);
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const locked = !!(await planLock(access.studentId));
  if (access.by === "student" && locked && b.action !== "loads") return NextResponse.json({ error: "Your advisor has locked your degree plan. Ask your advisor to change it." }, { status: 403 });
  try {
    if (b.action === "loads" || b.action === "apply") {
      if (b.loads && typeof b.loads === "object") {
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(b.loads as Record<string, unknown>)) {
          if (!/^\d{4}-(FA|SP|SU)$/.test(k) || v === "" || v === null || v === undefined) continue;
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 30) clean[k] = Math.round(n);
        }
        await saveLoads(access.studentId, clean, access.actorId);
      }
      if (b.action === "loads") return NextResponse.json({ ok: true });
      const inp = await loadPlanInput(access.studentId);
      if (!inp) return NextResponse.json({ error: "student not found" }, { status: 404 });
      const plan = planDegree(inp);
      const n = await applyPlan(inp, plan, "SYSTEM", access.actorId);
      await writeAuditLog({ actorUserId: access.actorId, action: "DEGREE_PLAN_GENERATED", entityType: "Student", entityId: access.studentId, metadata: { courses: n, finish: plan.finishLabel } });
      return NextResponse.json({ ok: true, placed: n, finish: plan.finishLabel });
    }
    if (b.action === "request") {
      if (access.by !== "staff") return NextResponse.json({ error: "Requests are made by the course advisor." }, { status: 403 });
      const user = await getAuthenticatedUser();
      const kind = String(b.kind || "");
      if (!KINDS[kind]) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
      if (kind !== "SUMMER_LOAD" && !b.courseCode) return NextResponse.json({ error: "Choose the course." }, { status: 400 });
      if (kind !== "AHEAD" && !/^\d{4}-SU$/.test(String(b.termKey || ""))) return NextResponse.json({ error: "Choose the summer." }, { status: 400 });
      await createRequest(access.studentId, kind, { courseCode: b.courseCode ? String(b.courseCode) : null, termKey: b.termKey ? String(b.termKey) : null, value: kind === "SUMMER_LOAD" ? 12 : null, note: b.note ? String(b.note).slice(0, 500) : null }, { id: access.actorId, name: user?.name || "" });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /already|Unknown|Choose/.test(m) ? m : PLANNER_HINT }, { status: 400 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
