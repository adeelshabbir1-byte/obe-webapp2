import { prisma } from "../db";
import { register, callRoute, type Ctx, type Item, type Action } from "./registry";
import { canDecideLeave, type ShortLeaveRow } from "../shortLeave";
import { details } from "../leaveRules";
import { approverFor } from "../approvers";
import { canDecide as canDecideResult } from "../resultApproval";
import { requestsFor, decideRequest } from "../planRequests";
import { breachesFor, canDecide as canDecideBreach } from "../assessmentRules";
import { stageApprovers, decide as decideStatus, TYPES } from "../studentStatus";
import { coordinatorIdsFor } from "../reportScope";
import { reviewBatchWhere } from "../reviewScope";
import { loadLabCourse } from "../labAccess";
import { canManageBenefits } from "../benefits";
import { canDecideRefunds } from "../feeRefunds";
import { canManageDegrees } from "../degrees";

// Providers for the approvals inbox, one per kind of approval. Each lists what is waiting for the person (using the
// module's own rule for who decides) and approves / returns through the module's own API route.

const db = prisma as unknown as Record<string, any>;
const safe = async <T,>(f: () => Promise<T[]>): Promise<T[]> => { try { return await f(); } catch { return []; } };
const names = async (ids: (string | null | undefined)[]) => new Map((await prisma.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
const studentsOf = async (ids: string[]) => new Map((await prisma.student.findMany({ where: { id: { in: ids.concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } })).map((s) => [s.id, s]));
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const item = (x: Omit<Item, "priority" | "actions"> & Partial<Pick<Item, "priority" | "actions">>): Item => ({ priority: "normal", actions: [], ...x });

// 1. Short leave — the HOD's step, then the Dean's where the leave type needs it.
register({
  kind: "LEAVE", label: "Leave", byPosition: true, bulk: true,
  async fetch({ user, w }) {
    const rows = await safe(() => db.shortLeave.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 200 }) as Promise<ShortLeaveRow[]>);
    const det = await details(rows.map((r) => r.id)).catch(() => new Map());
    const nm = await names(rows.map((r) => r.userId));
    const out: Item[] = [];
    for (const l of rows) {
      if (l.userId === user.id) continue;
      const d = det.get(l.id) as { deanStatus?: string } | undefined;
      let mine = false;
      if (d?.deanStatus === "PENDING") {
        // Same rule as the short-leave route: the Dean of the teacher's faculty, or whoever acts for / covers the Dean.
        const t = await prisma.user.findUnique({ where: { id: l.userId }, select: { departmentId: true, department_: { select: { facultyId: true } } } });
        const isDean = user.role === "DEAN" && user.managedById === l.chairmanId && !!user.facultyId && t?.department_?.facultyId === user.facultyId;
        mine = isDean || (await approverFor(w.chairmanId, "DEAN", { departmentId: t?.departmentId })).ids.includes(user.id);
      }
      else mine = await canDecideLeave(user as never, l);
      if (!mine) continue;
      out.push(item({ kind: "LEAVE", id: l.id, title: `${nm.get(l.userId) || "Teacher"}: leave ${day(l.fromDate)}–${day(l.toDate)}${d?.deanStatus === "PENDING" ? " (Dean's step)" : ""}`, from: nm.get(l.userId) || "—", area: l.reason.slice(0, 60), since: l.createdAt, due: l.fromDate, priority: new Date(l.fromDate).getTime() - Date.now() < 2 * 864e5 ? "high" : "normal", href: "/leave-approvals", actions: ["approve", "return"] }));
    }
    return out;
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/short-leave/[id]/route");
    return callRoute(POST as never, req, `/api/short-leave/${id}`, { action: action === "approve" ? "approve" : "reject", note: reason }, { id });
  },
});

// 2. Course results and 3. grade changes — the department's approver.
register({
  kind: "RESULT", label: "Course results", byPosition: true,
  async fetch({ user, w }) {
    const rows = await safe(() => db.courseResult.findMany({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "asc" }, take: 300 }) as Promise<{ courseId: string; submittedById: string | null; submittedAt: Date | null; updatedAt: Date }[]>);
    const courses = new Map((await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat(["none"]) }, coordinator: { managedById: w.chairmanId } }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } })).map((c) => [c.id, c]));
    const nm = await names(rows.map((r) => r.submittedById));
    const out: Item[] = [];
    for (const r of rows) { const c = courses.get(r.courseId); if (!c || !(await canDecideResult(user as never, c.id))) continue; out.push(item({ kind: "RESULT", id: c.id, title: `Result of ${c.code} ${c.title}`, from: nm.get(r.submittedById || "") || "Teacher", area: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`, since: r.submittedAt || r.updatedAt, due: null, href: "/results-approval", actions: ["approve", "return"] })); }
    return out;
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/results/decide/route");
    return callRoute(POST as never, req, "/api/results/decide", { courseId: id, action, note: reason });
  },
});
register({
  kind: "GRADE_CHANGE", label: "Grade changes", byPosition: true,
  async fetch({ user, w }) {
    const rows = await safe(() => db.gradeChangeRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 300 }) as Promise<{ id: string; courseId: string; studentId: string; oldGrade: string; newGrade: string; requestedById: string; createdAt: Date }[]>);
    const courses = new Map((await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat(["none"]) }, coordinator: { managedById: w.chairmanId } }, select: { id: true, code: true } })).map((c) => [c.id, c]));
    const [nm, st] = await Promise.all([names(rows.map((r) => r.requestedById)), studentsOf(rows.map((r) => r.studentId))]);
    const out: Item[] = [];
    for (const r of rows) { const c = courses.get(r.courseId); if (!c || !(await canDecideResult(user as never, c.id))) continue; const s = st.get(r.studentId); out.push(item({ kind: "GRADE_CHANGE", id: r.id, title: `${c.code}: ${s?.rollNumber || "student"} ${r.oldGrade} → ${r.newGrade}`, from: nm.get(r.requestedById) || "Teacher", area: s ? `${s.batch.degreeProgram} ${s.batch.batchName}` : "", since: r.createdAt, due: null, href: "/results-approval", actions: ["approve", "return"] })); }
    return out;
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/results/grade-change/[id]/route");
    return callRoute(POST as never, req, `/api/results/grade-change/${id}`, { action: action === "approve" ? "approve" : "reject", note: reason }, { id });
  },
});

// 4. Question papers sent for vetting.
register({
  kind: "PAPER_VETTING", label: "Paper vetting",
  async fetch({ user }) {
    if (!["CHAIRMAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEAN", "OMC", "DEPARTMENT_COORDINATOR"].includes(user.role)) return [];
    const where = await reviewBatchWhere(user as never);
    if (!where) return [];
    const courses = await prisma.course.findMany({ where: { batch: where }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } });
    const rows = await safe(() => db.paperVetting.findMany({ where: { courseId: { in: courses.map((c) => c.id).concat(["none"]) }, status: "SUBMITTED" }, orderBy: { submittedAt: "asc" } }) as Promise<{ id: string; courseId: string; examType: string; submittedAt: Date | null; updatedAt: Date }[]>);
    return rows.map((v) => { const c = courses.find((x) => x.id === v.courseId)!; return item({ kind: "PAPER_VETTING", id: v.id, title: `${v.examType} paper: ${c.code} ${c.title}`, from: c.instructor?.name || "Teacher", area: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`, since: v.submittedAt || v.updatedAt, due: null, href: `/paper-vetting?id=${v.id}`, note: "Open it to fill the vetting checklist." }); });
  },
});

// 5. Registration holds and 6. course registration requests — the batch advisor.
register({
  kind: "REGISTRATION_HOLD", label: "Registration holds",
  async fetch({ user }) {
    const rows = await safe(() => db.registrationHold.findMany({ where: { advisorId: user.id, status: "PENDING" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; studentId: string; term: string; cgpa: number; createdAt: Date }[]>);
    const st = await studentsOf(rows.map((r) => r.studentId));
    return rows.map((r) => { const s = st.get(r.studentId); return item({ kind: "REGISTRATION_HOLD", id: r.id, title: `Registration hold: ${s?.name || "student"} (CGPA ${r.cgpa.toFixed(2)}, ${r.term})`, from: s?.rollNumber || "", area: s ? `${s.batch.degreeProgram} ${s.batch.batchName}` : "", since: r.createdAt, due: null, priority: "high", href: "/advisor/dashboard", note: "Choose the courses the student may take." }); });
  },
});
register({
  kind: "REGISTRATION_REQUEST", label: "Course registration requests",
  async fetch({ user }) {
    const batches = await prisma.batch.findMany({ where: { advisorId: user.id }, select: { id: true } });
    if (!batches.length) return [];
    const rows = await safe(() => db.registrationApprovalRequest.findMany({ where: { status: "PENDING", student: { batchId: { in: batches.map((b) => b.id) } } }, include: { course: { select: { code: true } } }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; studentId: string; actionType: string; reasonCode: string; createdAt: Date; course: { code: string } }[]>);
    const st = await studentsOf(rows.map((r) => r.studentId));
    return rows.map((r) => { const s = st.get(r.studentId); return item({ kind: "REGISTRATION_REQUEST", id: r.id, title: `${s?.name || "Student"}: ${r.actionType.toLowerCase()} ${r.course.code}`, from: s?.rollNumber || "", area: r.reasonCode.replace(/_/g, " ").toLowerCase(), since: r.createdAt, due: null, href: "/advisor/dashboard" }); });
  },
});
register({
  kind: "OUT_OF_BATCH", label: "Out-of-batch course requests",
  async fetch({ user }) {
    const rows = await safe(() => db.outOfBatchRequest.findMany({ where: { status: "PENDING", course: { coordinatorId: user.id } }, include: { course: { select: { code: true, title: true } } }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; studentId: string; reason: string | null; createdAt: Date; course: { code: string; title: string } }[]>);
    const st = await studentsOf(rows.map((r) => r.studentId));
    return rows.map((r) => { const s = st.get(r.studentId); return item({ kind: "OUT_OF_BATCH", id: r.id, title: `${s?.name || "Student"} asks to take ${r.course.code} ${r.course.title}`, from: s?.rollNumber || "", area: r.reason || "", since: r.createdAt, due: null, href: "/coordinator/out-of-batch-requests" }); });
  },
});

// 7. Degree-plan requests (summer load, ahead, summer new).
register({
  kind: "PLAN_REQUEST", label: "Degree-plan requests", byPosition: true, bulk: true,
  async fetch({ user }) {
    const rows = ((await requestsFor(user.id)) || []).filter((r) => r.status === "PENDING");
    const st = await studentsOf(rows.map((r) => r.studentId));
    return rows.map((r) => { const s = st.get(r.studentId); return item({ kind: "PLAN_REQUEST", id: r.id, title: `${s?.name || "Student"}: ${r.kind.replace(/_/g, " ").toLowerCase()}${r.courseCode ? ` ${r.courseCode}` : ""}${r.value ? ` (${r.value})` : ""}`, from: s?.rollNumber || "", area: s ? `${s.batch.degreeProgram} ${s.batch.batchName}` : "", since: r.createdAt, due: null, href: "/plan-requests", actions: ["approve", "return"] }); });
  },
  async act({ user }, id, action, reason) {
    try { await decideRequest(id, action === "approve", reason || null, { id: user.id, name: user.name }); return { ok: true }; } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
  },
});

// 8. Assessment-rule exceptions.
register({
  kind: "ASSESSMENT_EXCEPTION", label: "Assessment-rule exceptions", byPosition: true,
  async fetch({ user }) {
    if (!["CHAIRMAN", "HEAD_OF_DEPARTMENT", "OMC", "DEAN"].includes(user.role)) return [];
    const leads = await coordinatorIdsFor(user as never).catch(() => [] as string[]);
    const groups = await breachesFor(leads).catch(() => []);
    const out: Item[] = [];
    for (const g of groups) {
      if (!(await canDecideBreach(user as never, g.courseId))) continue;
      for (const b of g.breaches.filter((x) => x.status === "PENDING")) out.push(item({ kind: "ASSESSMENT_EXCEPTION", id: `${g.courseId}|${g.source}|${b.ruleId}|${b.scope}|${b.value}`, title: `${g.label.split(" · ")[0]}: ${b.rule} — ${b.value}% (limit ${b.limit})`, from: g.source === "SE" ? "Subject Expert's plan" : "Teacher's plan", area: g.label.split(" · ")[1] || "", since: new Date(), due: null, href: "/omc/assessment-rules", actions: ["approve", "return"] }));
    }
    return out;
  },
  async act(_c, id, action, reason, req) {
    const [courseId, source, ruleId, scope, value] = id.split("|");
    const { POST } = await import("../../app/api/omc/assessment-rules/route");
    return callRoute(POST as never, req, "/api/omc/assessment-rules", { action: "decide", courseId, source, ruleId, scope, value: Number(value), approve: action === "approve", note: reason });
  },
});

// 9. OMC: weight exceptions and template changes.
register({
  kind: "WEIGHT_EXCEPTION", label: "Weight exceptions (OMC)",
  async fetch({ user, w }) {
    if (user.role !== "OMC") return [];
    const rows = await safe(() => db.weightExceptionRequest.findMany({ where: { status: "pending", course: { coordinator: { managedById: w.chairmanId } } }, include: { course: { select: { code: true, title: true } } }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; requestedById: string; createdAt: Date; course: { code: string; title: string } }[]>);
    const nm = await names(rows.map((r) => r.requestedById));
    return rows.map((r) => item({ kind: "WEIGHT_EXCEPTION", id: r.id, title: `Assessment weights outside the limits: ${r.course.code} ${r.course.title}`, from: nm.get(r.requestedById) || "", area: "", since: r.createdAt, due: null, href: "/omc/weight-exceptions", actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { PATCH } = await import("../../app/api/omc/weight-exceptions/[requestId]/route");
    return callRoute(PATCH as never, req, `/api/omc/weight-exceptions/${id}`, { status: action === "approve" ? "approved" : "rejected", comment: reason }, { requestId: id }, "PATCH");
  },
});
register({
  kind: "TEMPLATE_CHANGE", label: "Course template changes (OMC)",
  async fetch({ user, w }) {
    if (user.role !== "OMC") return [];
    const rows = await safe(() => db.templateChangeRequest.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; courseId: string; requestedById: string; reason: string; createdAt: Date }[]>);
    const courses = new Map((await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat(["none"]) }, coordinator: { managedById: w.chairmanId } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, c]));
    const nm = await names(rows.map((r) => r.requestedById));
    return rows.filter((r) => courses.has(r.courseId)).map((r) => item({ kind: "TEMPLATE_CHANGE", id: r.id, title: `Change the approved template of ${courses.get(r.courseId)!.code}`, from: nm.get(r.requestedById) || "", area: r.reason.slice(0, 80), since: r.createdAt, due: null, href: "/omc/template-changes", actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { PATCH } = await import("../../app/api/omc/template-changes/[requestId]/route");
    return callRoute(PATCH as never, req, `/api/omc/template-changes/${id}`, { status: action === "approve" ? "approved" : "rejected", comment: reason }, { requestId: id }, "PATCH");
  },
});

// 10. Student status changes — each stage's position.
register({
  kind: "STATUS_CHANGE", label: "Student status changes", byPosition: true,
  async fetch({ user, w }) {
    const rows = await safe(() => db.studentStatusRequest.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; chairmanId: string; studentId: string; type: string; stage: string; effectiveDate: Date; createdAt: Date; raisedById: string }[]>);
    const [st, nm] = await Promise.all([studentsOf(rows.map((r) => r.studentId)), names(rows.map((r) => r.raisedById))]);
    const out: Item[] = [];
    for (const r of rows) { if (!(await stageApprovers(r, r.stage)).ids.includes(user.id)) continue; const s = st.get(r.studentId); out.push(item({ kind: "STATUS_CHANGE", id: r.id, title: `${TYPES[r.type]?.label || r.type}: ${s?.name || "student"} (${s?.rollNumber || ""})`, from: nm.get(r.raisedById) || "", area: s ? `${s.batch.degreeProgram} ${s.batch.batchName}` : "", since: r.createdAt, due: r.effectiveDate, href: "/status-changes", actions: ["approve", "return"] })); }
    return out;
  },
  async act({ user }, id, action, reason) {
    if (action === "return" && !reason) return { ok: false, error: "Give the reason." };
    try { await decideStatus({ id: user.id, name: user.name }, id, action === "approve", reason); return { ok: true }; } catch (e) { return { ok: false, error: String((e as Error).message || e) }; }
  },
});

// 11. Accreditation tasks signed off and waiting for review.
register({
  kind: "ACCREDITATION_TASK", label: "Accreditation tasks to review", byPosition: true,
  async fetch({ user, w }) {
    const cycles = await safe(() => db.accreditationCycle.findMany({ where: { chairmanId: w.chairmanId, status: "OPEN" }, select: { id: true, program: true, departmentId: true, body: true } }) as Promise<{ id: string; program: string; departmentId: string | null; body: string }[]>);
    const out: Item[] = [];
    for (const c of cycles) {
      const managing = user.role === "CHAIRMAN" || (await approverFor(w.chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: c.departmentId })).ids.includes(user.id) || (user.role === "DEAN");
      if (!managing) continue;
      const ts = await safe(() => db.accreditationTask.findMany({ where: { cycleId: c.id, status: "SUBMITTED" }, orderBy: { submittedAt: "asc" } }) as Promise<{ id: string; code: string; submittedAt: Date | null; submittedById: string | null; dueDate: Date | null; updatedAt: Date }[]>);
      const nm = await names(ts.map((t) => t.submittedById));
      for (const t of ts) out.push(item({ kind: "ACCREDITATION_TASK", id: t.id, title: `${c.body} ${c.program}: task ${t.code} signed off`, from: nm.get(t.submittedById || "") || "Task owner", area: c.program, since: t.submittedAt || t.updatedAt, due: t.dueDate, href: `/accreditation/tasks/${t.id}`, actions: ["approve", "return"] }));
    }
    return out;
  },
  async act(_c, id, action, reason, req) {
    const { PATCH } = await import("../../app/api/accreditation/tasks/[id]/route");
    return callRoute(PATCH as never, req, `/api/accreditation/tasks/${id}`, { action, note: reason }, { id }, "PATCH");
  },
});

// 12. Teachers lent between departments (Dean and HOD steps) and 13. teacher assignments (HOD).
register({
  kind: "TEACHER_LOAN", label: "Teacher requests between departments",
  async fetch({ user, w }) {
    let rows: { id: string; courseId: string; createdAt: Date; requestedById: string; requestingDepartmentId: string; lendingDepartmentId: string; requesterDeanStatus: string; lenderDeanStatus: string; status: string }[] = [];
    if (user.role === "DEAN" && user.facultyId) rows = await safe(() => db.teacherLoanRequest.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING", OR: [{ requesterDeanStatus: "PENDING", requestingDepartment: { facultyId: user.facultyId } }, { lenderDeanStatus: "PENDING", lendingDepartment: { facultyId: user.facultyId } }] } }));
    else if (user.role === "HEAD_OF_DEPARTMENT" && user.departmentId) rows = await safe(() => db.teacherLoanRequest.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING", lendingDepartmentId: user.departmentId, requesterDeanStatus: { not: "PENDING" }, lenderDeanStatus: { not: "PENDING" } } }));
    if (!rows.length) return [];
    const courses = new Map((await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId) } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, c]));
    const nm = await names(rows.map((r) => r.requestedById));
    return rows.map((r) => item({ kind: "TEACHER_LOAN", id: r.id, title: `Teacher asked for ${courses.get(r.courseId)?.code || "a course"}${user.role === "DEAN" ? " (Dean's step)" : ""}`, from: nm.get(r.requestedById) || "", area: courses.get(r.courseId)?.title || "", since: r.createdAt, due: null, href: user.role === "DEAN" ? "/dean/approvals" : "/hod/borrow-teacher", actions: user.role === "DEAN" ? ["approve", "return"] : [] }));
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/dean/loans/route");
    return callRoute(POST as never, req, "/api/dean/loans", { loanId: id, decision: action === "approve" ? "APPROVE" : "REJECT", note: reason });
  },
});
register({
  kind: "TEACHER_ASSIGNMENT", label: "Teacher assignments to approve", bulk: true,
  async fetch({ user }) {
    if (user.role !== "HEAD_OF_DEPARTMENT") return [];
    const cs = await prisma.course.findMany({ where: { instructorApproval: "PENDING", coordinator: { managedById: user.managedById || "none", departmentId: user.departmentId || "none" } }, select: { id: true, code: true, title: true, createdAt: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } }) as unknown as { id: string; code: string; title: string; createdAt?: Date; instructor: { name: string } | null; batch: { degreeProgram: string; batchName: string } | null }[];
    return cs.map((c) => item({ kind: "TEACHER_ASSIGNMENT", id: c.id, title: `${c.instructor?.name || "A teacher"} to teach ${c.code} ${c.title}`, from: "Course Assigner", area: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`, since: c.createdAt || new Date(), due: null, href: "/hod/department", actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/hod/approvals/route");
    return callRoute(POST as never, req, "/api/hod/approvals", { courseId: id, decision: action === "approve" ? "APPROVE" : "REJECT", note: reason });
  },
});

// 14. Labs: manuals to review and lab marks to approve into the theory result (the theory teacher).
register({
  kind: "LAB_MANUAL", label: "Lab manuals to review",
  async fetch({ user }) {
    const rows = await safe(() => db.labFileReview.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 300 }) as Promise<{ id: string; versionId: string; labCourseId: string; labNumber: number; kind: string; createdAt: Date }[]>);
    const out: Item[] = [];
    const cache = new Map<string, Awaited<ReturnType<typeof loadLabCourse>>>();
    for (const r of rows) {
      if (!cache.has(r.labCourseId)) cache.set(r.labCourseId, await loadLabCourse(r.labCourseId).catch(() => null));
      const l = cache.get(r.labCourseId);
      if (!l || l.lead?.id !== user.id) continue;
      out.push(item({ kind: "LAB_MANUAL", id: r.versionId, title: `${l.lab.code} lab ${r.labNumber}: ${r.kind === "SOLUTION" ? "solution" : "manual"} to approve`, from: l.lab.labEngineer?.name || "Lab Engineer", area: l.lab.title, since: r.createdAt, due: null, href: `/lab-engineer/labs/${l.lab.id}`, actions: ["approve", "return"] }));
    }
    return out;
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/lab/plan/route");
    const r = await db.labFileReview.findUnique({ where: { versionId: id } });
    return callRoute(POST as never, req, "/api/lab/plan", { action: "review", labCourseId: r?.labCourseId, versionId: id, decision: action === "approve" ? "APPROVED" : "RETURNED", note: reason });
  },
});
register({
  kind: "LAB_MARKS", label: "Lab marks to approve",
  async fetch({ user }) {
    const rows = await safe(() => db.labTheorySetting.findMany({ where: { intoTheory: true, approvedAt: null } }) as Promise<{ labCourseId: string; updatedAt: Date; changeRequest: string | null }[]>);
    const out: Item[] = [];
    for (const r of rows) {
      const l = await loadLabCourse(r.labCourseId).catch(() => null);
      if (!l || l.lead?.id !== user.id || !l.theory) continue;
      if (!(await prisma.labMark.count({ where: { courseId: l.lab.id } }))) continue;
      out.push(item({ kind: "LAB_MARKS", id: l.lab.id, title: `${l.lab.code}: approve lab marks into ${l.theory.code}`, from: l.lab.labEngineer?.name || "Lab Engineer", area: l.lab.title, since: r.updatedAt, due: null, href: `/lab-engineer/labs/${l.lab.id}`, note: "Opens the lab page (the approval adds the Lab assessment to the theory course)." }));
    }
    return out;
  },
});

// 15. Meeting action items given to the person.
register({
  kind: "MEETING_ACTION", label: "Meeting action items",
  async fetch({ user }) {
    const rows = await safe(() => db.meetingAction.findMany({ where: { ownerId: user.id, status: "OPEN" }, orderBy: [{ dueDate: "asc" }] }) as Promise<{ id: string; meetingId: string; text: string; dueDate: Date | null; createdAt: Date }[]>);
    return rows.map((r) => item({ kind: "MEETING_ACTION", id: r.id, title: r.text.slice(0, 120), from: "Meeting", area: "", since: r.createdAt, due: r.dueDate, priority: r.dueDate && new Date(r.dueDate) < new Date() ? "high" : "normal", href: "/meetings" }));
  },
});

// 16. Finance: employee-benefit claims and fee refunds.
register({
  kind: "BENEFIT_CLAIM", label: "Employee-benefit claims", bulk: false,
  async fetch({ w }) {
    if (!canManageBenefits(w)) return [];
    const plans = await safe(() => db.benefitPlan.findMany({ where: { chairmanId: w.chairmanId }, select: { id: true, name: true } }) as Promise<{ id: string; name: string }[]>);
    const rows = await safe(() => db.benefitClaim.findMany({ where: { planId: { in: plans.map((p) => p.id).concat(["none"]) }, status: "SUBMITTED" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; planId: string; userId: string; amount: number; description: string; createdAt: Date }[]>);
    const nm = await names(rows.map((r) => r.userId));
    return rows.map((r) => item({ kind: "BENEFIT_CLAIM", id: r.id, title: `Claim of Rs ${r.amount.toLocaleString("en-PK")}: ${r.description.slice(0, 60)}`, from: nm.get(r.userId) || "", area: plans.find((p) => p.id === r.planId)?.name || "", since: r.createdAt, due: null, href: "/benefits", actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/benefits/route");
    return callRoute(POST as never, req, "/api/benefits", { action: "decide", claimId: id, status: action === "approve" ? "APPROVED" : "REJECTED", note: reason });
  },
});
register({
  kind: "FEE_REFUND", label: "Fee refunds",
  async fetch({ w }) {
    if (!canDecideRefunds(w)) return [];
    const rows = await safe(() => db.feeRefundCase.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; studentId: string; refundAmount: number; refundPct: number; createdAt: Date }[]>);
    const st = await studentsOf(rows.map((r) => r.studentId));
    return rows.map((r) => { const s = st.get(r.studentId); return item({ kind: "FEE_REFUND", id: r.id, title: `Refund Rs ${r.refundAmount.toLocaleString("en-PK")} (${r.refundPct}% of tuition) to ${s?.name || "student"}`, from: s?.rollNumber || "", area: s ? s.batch.degreeProgram : "", since: r.createdAt, due: null, href: "/fee-refunds", actions: ["approve", "return"] }); });
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/fee-refunds/route");
    return callRoute(POST as never, req, "/api/fee-refunds", { action: "decide", id, approve: action === "approve", note: reason });
  },
});

// 17. Degree verification requests not yet answered.
register({
  kind: "DEGREE_VERIFICATION", label: "Degree verification requests",
  async fetch({ w }) {
    if (!canManageDegrees(w)) return [];
    const rows = await safe(() => db.degreeVerification.findMany({ where: { chairmanId: w.chairmanId, response: null }, orderBy: { receivedAt: "asc" } }) as Promise<{ id: string; requesterName: string; rollNumber: string | null; serialNo: string | null; receivedAt: Date }[]>);
    return rows.map((r) => item({ kind: "DEGREE_VERIFICATION", id: r.id, title: `Verify degree ${r.serialNo || r.rollNumber || ""}`, from: r.requesterName, area: "", since: r.receivedAt, due: new Date(new Date(r.receivedAt).getTime() + 7 * 864e5), href: "/degrees?tab=verify" }));
  },
});

// 18. QAA implementation actions the person owns (due within two weeks or overdue).
register({
  kind: "QAA_ACTION", label: "QAA actions",
  async fetch({ user }) {
    const soon = new Date(Date.now() + 14 * 864e5);
    const rows = await safe(() => db.qaaAction.findMany({ where: { ownerId: user.id, status: { not: "DONE" }, dueDate: { lte: soon } }, orderBy: { dueDate: "asc" } }) as Promise<{ id: string; cycleId: string; action: string; dueDate: Date | null; progressPct: number; updatedAt: Date }[]>);
    return rows.map((r) => item({ kind: "QAA_ACTION", id: r.id, title: r.action.slice(0, 120), from: "QAA self-assessment", area: `${r.progressPct}% done`, since: r.updatedAt, due: r.dueDate, priority: r.dueDate && new Date(r.dueDate) < new Date() ? "high" : "normal", href: `/qaa?id=${r.cycleId}` }));
  },
});

// 19. Assets: writing off an item (the condemnation committee's finding, approved by the Institute Head).
register({
  kind: "ASSET_WRITE_OFF", label: "Asset write-offs", byPosition: true,
  async fetch({ user, w }) {
    if (!(await approverFor(w.chairmanId, "INSTITUTE_HEAD")).ids.includes(user.id)) return [];
    const rows = await safe(() => db.assetCondemnation.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; assetId: string; reason: string; requestedById: string; createdAt: Date }[]>);
    const assets = new Map(((await safe(() => db.asset.findMany({ where: { id: { in: rows.map((r) => r.assetId).concat(["none"]) } }, select: { id: true, assetTag: true, item: true } }))) as { id: string; assetTag: string; item: string }[]).map((a) => [a.id, a]));
    const nm = await names(rows.map((r) => r.requestedById));
    return rows.map((r) => item({ kind: "ASSET_WRITE_OFF", id: r.id, title: `Write off ${assets.get(r.assetId)?.item || "an item"} (${assets.get(r.assetId)?.assetTag || ""})`, from: nm.get(r.requestedById) || "", area: r.reason.slice(0, 80), since: r.createdAt, due: null, href: "/assets", actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/assets/route");
    return callRoute(POST as never, req, "/api/assets", { action: "decideCondemn", id, approve: action === "approve", note: reason });
  },
});

// 20. Recruitment: requests to hire (Dean, Institute Head, Finance) and the selection board's recommendation (Institute Head).
register({
  kind: "HIRING_REQUEST", label: "Requests to hire", byPosition: true,
  async fetch({ user, w }) {
    const { stageApprovers, DESIGNATIONS } = await import("../recruitment");
    const rows = await safe(() => db.hiringRequest.findMany({ where: { chairmanId: w.chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }) as Promise<{ id: string; chairmanId: string; departmentId: string | null; designation: string; area: string; positions: number; justification: string; raisedById: string; stage: string; createdAt: Date }[]>);
    const nm = await names(rows.map((r) => r.raisedById));
    const out: Item[] = [];
    for (const r of rows) if ((await stageApprovers(r, r.stage)).includes(user.id)) out.push(item({ kind: "HIRING_REQUEST", id: r.id, title: `Hire ${r.positions} ${DESIGNATIONS[r.designation]} (${r.area})${r.stage === "FINANCE" ? " — confirm the budget" : ""}`, from: nm.get(r.raisedById) || "", area: r.justification.slice(0, 80), since: r.createdAt, due: null, href: "/recruitment", actions: ["approve", "return"] }));
    return out;
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/recruitment/route");
    return callRoute(POST as never, req, "/api/recruitment", { action: "decide", id, approve: action === "approve", note: reason });
  },
});
register({
  kind: "APPOINTMENT", label: "Appointments (selection board)", byPosition: true,
  async fetch({ user, w }) {
    if (!(await approverFor(w.chairmanId, "INSTITUTE_HEAD")).ids.includes(user.id)) return [];
    const ads = await safe(() => db.jobAdvert.findMany({ where: { chairmanId: w.chairmanId } }) as Promise<{ id: string; title: string }[]>);
    const boards = await safe(() => db.selectionBoard.findMany({ where: { advertId: { in: ads.map((a) => a.id).concat(["none"]) }, recommendedAt: { not: null }, approvedAt: null } }) as Promise<{ advertId: string; recommendationJson: string; recommendedAt: Date }[]>);
    return boards.map((b) => item({ kind: "APPOINTMENT", id: b.advertId, title: `Appoint ${(JSON.parse(b.recommendationJson) as string[]).length} candidate(s): ${ads.find((a) => a.id === b.advertId)?.title || ""}`, from: "Selection board", area: "Merit list on the Recruitment page", since: b.recommendedAt, due: null, href: `/recruitment?tab=board&ad=${b.advertId}`, actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/recruitment/route");
    return callRoute(POST as never, req, "/api/recruitment", { action: "approveBoard", advertId: id, approve: action === "approve", note: reason });
  },
});

// 21. Research office: grant proposals waiting for ORIC's review.
register({
  kind: "GRANT_REVIEW", label: "Grant proposals (ORIC review)",
  async fetch({ user, w }) {
    const { isOric } = await import("../research");
    if (!(await isOric(w))) return [];
    const rows = await safe(() => db.grantProposal.findMany({ where: { chairmanId: w.chairmanId, status: "INTERNAL_REVIEW", piId: { not: user.id } }, orderBy: { updatedAt: "asc" } }) as Promise<{ id: string; piId: string; title: string; agency: string; amount: number | null; updatedAt: Date }[]>);
    const nm = await names(rows.map((r) => r.piId));
    return rows.map((r) => item({ kind: "GRANT_REVIEW", id: r.id, title: `Grant proposal: ${r.title}`, from: nm.get(r.piId) || "", area: `${r.agency}${r.amount ? ` · Rs ${Math.round(r.amount).toLocaleString("en-PK")}` : ""}`, since: r.updatedAt, due: null, href: "/research?tab=grants", actions: ["approve", "return"] }));
  },
  async act(_c, id, action, reason, req) {
    const { POST } = await import("../../app/api/research/route");
    return callRoute(POST as never, req, "/api/research", { action: "review", id, ok: action === "approve", note: reason });
  },
});

export const PROVIDERS_LOADED = true;
export type { Action };
