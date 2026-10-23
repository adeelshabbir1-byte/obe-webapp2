import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { writeAuditLog } from "./audit";

// The Quality Office (QEC / Directorate of Quality Assurance): new program approvals, PQR registrations, Citizen
// Portal complaints, rankings data, department reviews, quality awareness sessions, affiliated colleges, the QA
// profile and yearly plan, and action plans (for IPE standards, department reviews and the yearly plan).
// All kept in one table (QaRecord) — each kind's fields are described below and rendered by one generic page.

export const qadb = prisma as unknown as Record<string, any>;
export const QA_HINT = "The Quality Office needs prisma/migration_qa_office.sql — run it in Supabase.";

export type QField = { key: string; label: string; type?: "text" | "textarea" | "date" | "number" | "select" | "program" | "department" | "lead"; options?: [string, string][]; required?: boolean; list?: boolean };
export type QKind = { key: string; title: string; short: string; what: string; fields: QField[]; titleKey: string; statusKey?: string; dueKey?: string; actions?: boolean };

const yes = (xs: string[]): [string, string][] => xs.map((x) => [x, x]);
export const STAGES: [string, string][] = [["FEASIBILITY", "Feasibility (demand, faculty, labs, budget)"], ["BOS", "Board of Studies"], ["BOF", "Board of Faculty"], ["AC", "Academic Council"], ["NOC", "HEC NOC"], ["COUNCIL", "Accreditation council approval / registration"]];

export const QKINDS: QKind[] = [
  {
    key: "PROGRAM_PROPOSAL", title: "New program approvals", short: "New programs", titleKey: "programName", statusKey: "status",
    what: "A new degree program from proposal to approval: feasibility, Board of Studies, Board of Faculty, Academic Council, HEC NOC and the council. Once approved it is created in OBEHUB in one click.",
    fields: [
      { key: "programName", label: "Program name", required: true, list: true }, { key: "shortCode", label: "Short code (e.g. BSDS)", required: true, list: true },
      { key: "level", label: "Level", type: "select", options: [["UG16", "Undergraduate (16 years)"], ["ADP", "Associate degree (14 years)"]] },
      { key: "departmentId", label: "Department", type: "department", list: true }, { key: "leadId", label: "Program Lead (when created)", type: "lead" },
      { key: "council", label: "Council", type: "select", options: yes(["NCEAC", "NBEAC", "PEC", "HEC", "Other"]) },
      { key: "launchTerm", label: "Planned first intake (e.g. Fall 2027)" }, { key: "seats", label: "Seats", type: "number" },
      { key: "demand", label: "Demand / market need", type: "textarea" }, { key: "faculty", label: "Faculty available / to hire", type: "textarea" },
      { key: "labs", label: "Labs and resources", type: "textarea" }, { key: "budget", label: "Budget (Rs)", type: "number" },
      { key: "status", label: "Status", type: "select", options: yes(["Proposed", "In approval", "Approved", "Returned", "Dropped", "Created"]), list: true },
    ],
  },
  {
    key: "PQR", title: "Pakistan Qualifications Register", short: "PQR", titleKey: "program", statusKey: "status", dueKey: "renewalDue",
    what: "Each program's registration on the HEC Pakistan Qualifications Register: NQF level, credits, registration number, status and renewal.",
    fields: [
      { key: "program", label: "Program", type: "program", required: true, list: true }, { key: "nqfLevel", label: "NQF level", type: "select", options: [["5", "5 — Associate degree"], ["6", "6 — Bachelor (4-year)"], ["7", "7 — Master / MPhil"], ["8", "8 — PhD"]], list: true },
      { key: "credits", label: "Credit hours", type: "number", list: true }, { key: "regNo", label: "PQR registration no.", list: true },
      { key: "status", label: "Status", type: "select", options: yes(["Draft", "Submitted", "Registered", "Renewal due", "Expired"]), list: true },
      { key: "registeredOn", label: "Registered on", type: "date" }, { key: "renewalDue", label: "Renewal due", type: "date", list: true }, { key: "note", label: "Note", type: "textarea" },
    ],
  },
  {
    key: "CITIZEN", title: "Citizen Portal complaints", short: "Citizen Portal", titleKey: "subject", statusKey: "status", dueKey: "replyBy",
    what: "Complaints received through the Pakistan Citizen Portal: who handles them, the reply deadline, the response and escalation.",
    fields: [
      { key: "ticketNo", label: "Portal ticket no.", required: true, list: true }, { key: "receivedOn", label: "Received on", type: "date", required: true, list: true },
      { key: "complainant", label: "Complainant" }, { key: "subject", label: "Subject", required: true, list: true }, { key: "details", label: "Details", type: "textarea" },
      { key: "departmentId", label: "Department responsible", type: "department", list: true }, { key: "handler", label: "Handled by" },
      { key: "replyBy", label: "Reply deadline", type: "date", list: true },
      { key: "status", label: "Status", type: "select", options: yes(["Open", "In progress", "Replied", "Escalated", "Closed"]), list: true },
      { key: "response", label: "Response sent", type: "textarea" }, { key: "repliedOn", label: "Replied on", type: "date" },
    ],
  },
  {
    key: "RANKING", title: "Rankings data", short: "Rankings", titleKey: "ranking", statusKey: "status",
    what: "The figures each ranking asks for, kept per year (HEC ranking, THE, QS and others). “Fill from OBEHUB” takes faculty and student counts from the system.",
    fields: [
      { key: "ranking", label: "Ranking", type: "select", options: yes(["HEC", "THE", "QS", "QS Asia", "Other"]), required: true, list: true }, { key: "year", label: "Year", type: "number", required: true, list: true },
      { key: "faculty", label: "Full-time faculty", type: "number", list: true }, { key: "phdFaculty", label: "Faculty with PhD", type: "number", list: true }, { key: "students", label: "Students", type: "number", list: true },
      { key: "intlStudents", label: "International students", type: "number" }, { key: "intlFaculty", label: "International faculty", type: "number" },
      { key: "publications", label: "Publications (year)", type: "number" }, { key: "citations", label: "Citations", type: "number" }, { key: "employers", label: "Employer contacts", type: "number" },
      { key: "graduates", label: "Graduates (year)", type: "number" }, { key: "employed", label: "Graduates employed in 6 months", type: "number" },
      { key: "status", label: "Status", type: "select", options: yes(["Collecting", "Submitted"]), list: true }, { key: "note", label: "Note", type: "textarea" },
    ],
  },
  {
    key: "DEPT_REVIEW", title: "Department / subject reviews", short: "Department reviews", titleKey: "departmentId", statusKey: "status", actions: true,
    what: "A periodic review of a department with an external reviewer: teaching, research, staffing, resources and results, and an action plan.",
    fields: [
      { key: "departmentId", label: "Department", type: "department", required: true, list: true }, { key: "year", label: "Year", type: "number", list: true },
      { key: "reviewer", label: "External reviewer (name, institution)", list: true }, { key: "visitDate", label: "Review visit", type: "date" },
      { key: "teaching", label: "Teaching and learning", type: "textarea" }, { key: "research", label: "Research", type: "textarea" }, { key: "staffing", label: "Staffing", type: "textarea" },
      { key: "resources", label: "Resources (labs, library, rooms)", type: "textarea" }, { key: "results", label: "Student results and outcomes", type: "textarea" },
      { key: "overall", label: "Overall", type: "select", options: yes(["Satisfactory", "Needs improvement", "Unsatisfactory"]), list: true },
      { key: "status", label: "Status", type: "select", options: yes(["Planned", "Visited", "Report received", "Actions in progress", "Closed"]), list: true },
    ],
  },
  {
    key: "AWARENESS", title: "Quality awareness sessions", short: "Awareness sessions", titleKey: "title",
    what: "Sessions on quality and OBE for students and quality staff (faculty training is under Faculty Development). Counts feed the IPE and the annual QA report.",
    fields: [
      { key: "title", label: "Session", required: true, list: true }, { key: "date", label: "Date", type: "date", required: true, list: true },
      { key: "audience", label: "Audience", type: "select", options: yes(["Students", "QA staff", "Faculty", "Mixed"]), list: true }, { key: "facilitator", label: "Facilitator", list: true },
      { key: "attendees", label: "Attendees", type: "number", required: true, list: true }, { key: "note", label: "Note / feedback", type: "textarea" },
    ],
  },
  {
    key: "AFFILIATE", title: "Affiliated colleges", short: "Affiliated colleges", titleKey: "name", statusKey: "status", dueKey: "renewalDue",
    what: "For affiliating universities: affiliated institutions, affiliation status and renewal, inspection visits and their programs.",
    fields: [
      { key: "name", label: "College", required: true, list: true }, { key: "city", label: "City", list: true }, { key: "principal", label: "Principal / contact" },
      { key: "status", label: "Status", type: "select", options: yes(["Provisional", "Affiliated", "Renewal due", "Suspended", "Withdrawn"]), list: true },
      { key: "affiliatedOn", label: "Affiliated on", type: "date" }, { key: "renewalDue", label: "Renewal due", type: "date", list: true },
      { key: "programs", label: "Programs offered", type: "textarea" }, { key: "lastInspection", label: "Last inspection", type: "date", list: true }, { key: "inspection", label: "Inspection findings", type: "textarea" },
    ],
  },
  {
    key: "QA_PLAN", title: "QA yearly plan", short: "Yearly plan", titleKey: "year", statusKey: "status", actions: true,
    what: "The quality office's plan for the year: activities, targets and who does them. Activities are tracked as actions; the annual QA report is generated from everything here.",
    fields: [
      { key: "year", label: "Year", type: "number", required: true, list: true }, { key: "targets", label: "Targets for the year", type: "textarea" },
      { key: "budget", label: "Budget (Rs)", type: "number" }, { key: "status", label: "Status", type: "select", options: yes(["Draft", "Approved", "Completed"]), list: true },
    ],
  },
];
export const ACTION_FIELDS: QField[] = [{ key: "action", label: "Action", required: true }, { key: "owner", label: "Owner" }, { key: "due", label: "Due", type: "date" }, { key: "status", label: "Status", type: "select", options: yes(["Open", "Done", "Dropped"]) }];
export const PROFILE_FIELDS: QField[] = [
  { key: "name", label: "Office name", required: true }, { key: "vision", label: "Vision", type: "textarea" }, { key: "mission", label: "Mission", type: "textarea" },
  { key: "functions", label: "Functions", type: "textarea" }, { key: "ipeTeam", label: "IPE self-assessment team (one per line: name — role)", type: "textarea" },
];
export const qkind = (k: string) => QKINDS.find((x) => x.key === k) || null;

type U = { id: string; role: string; managedById: string | null; extraRoles?: string[] | null; departmentId?: string | null };
export const canEditQa = (u: U) => ["CHAIRMAN", "DEAN"].includes(u.role) || (u.extraRoles || []).some((x) => x === "QEC_INCHARGE" || x === "QEC_MEMBER");
export const canViewQa = (u: U) => canEditQa(u) || ["HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC"].includes(u.role);
export const qaInstitute = (u: U) => (u.role === "CHAIRMAN" ? Promise.resolve(u.id) : chairmanIdFor(u as never));

export type QRec = { id: string; chairmanId: string; kind: string; refId: string | null; data: Record<string, string>; createdAt: Date; updatedAt: Date };
const parse = (s: string) => { try { return JSON.parse(s) as Record<string, string>; } catch { return {}; } };

export async function records(cid: string, kind: string, refId?: string): Promise<QRec[] | null> {
  const rows = (await qadb.qaRecord.findMany({ where: { chairmanId: cid, kind, ...(refId !== undefined ? { refId } : {}) }, orderBy: { createdAt: "desc" }, take: 1000 }).catch(() => null)) as { id: string; chairmanId: string; kind: string; refId: string | null; dataJson: string; createdAt: Date; updatedAt: Date }[] | null;
  return rows ? rows.map((r) => ({ ...r, data: parse(r.dataJson) })) : null;
}

export async function saveRecord(cid: string, by: string, kind: string, id: string | null, refId: string | null, input: Record<string, unknown>) {
  const fields = kind === "ACTION" ? ACTION_FIELDS : kind === "QA_PROFILE" ? PROFILE_FIELDS : kind === "STAGES" ? [] : qkind(kind)?.fields;
  if (!fields) throw new Error("Unknown record type.");
  const data: Record<string, string> = {};
  for (const f of fields) { const v = input[f.key]; data[f.key] = v === undefined || v === null ? "" : String(v).trim().slice(0, f.type === "textarea" ? 5000 : 300); }
  if (kind === "STAGES") Object.assign(data, Object.fromEntries(Object.entries(input).filter(([k]) => /^[A-Z]+_(date|minute|decision|note)$/.test(k)).map(([k, v]) => [k, String(v ?? "").slice(0, 1000)])));
  const miss = fields.filter((f) => f.required && !data[f.key]).map((f) => f.label);
  if (miss.length) throw new Error(`Fill in: ${miss.join(", ")}.`);
  if (id) {
    const ex = await qadb.qaRecord.findFirst({ where: { id, chairmanId: cid } });
    if (!ex) throw new Error("Not found.");
    const merged = kind === "STAGES" ? { ...parse(ex.dataJson), ...data } : data;
    await qadb.qaRecord.update({ where: { id }, data: { dataJson: JSON.stringify(merged), updatedById: by, updatedAt: new Date() } });
    return id;
  }
  const nid = randomUUID();
  await qadb.qaRecord.create({ data: { id: nid, chairmanId: cid, kind, refId, dataJson: JSON.stringify(data), createdById: by, updatedById: by } });
  await writeAuditLog({ actorUserId: by, action: "QA_RECORD_ADDED", entityType: "QaRecord", entityId: nid, metadata: { kind } });
  return nid;
}

export async function deleteRecord(cid: string, by: string, id: string) {
  await qadb.qaRecord.deleteMany({ where: { OR: [{ id }, { refId: id }], chairmanId: cid } });
  await writeAuditLog({ actorUserId: by, action: "QA_RECORD_DELETED", entityType: "QaRecord", entityId: id });
}

/** Stages of a program proposal (kept as one STAGES record whose refId is the proposal). */
export async function stagesOf(cid: string, proposalId: string) {
  const r = (await records(cid, "STAGES", proposalId))?.[0];
  return { id: r?.id || null, data: r?.data || {} };
}
export const allStagesApproved = (d: Record<string, string>) => STAGES.filter(([k]) => k !== "COUNCIL").every(([k]) => d[`${k}_decision`] === "Approved");

/** Create the approved program in OBEHUB: the degree program under its Program Lead, its department, profile and dates. */
export async function createProgram(cid: string, by: string, proposalId: string) {
  const p = (await qadb.qaRecord.findFirst({ where: { id: proposalId, chairmanId: cid, kind: "PROGRAM_PROPOSAL" } })) as { dataJson: string } | null;
  if (!p) throw new Error("Not found.");
  const d = parse(p.dataJson);
  const st = (await stagesOf(cid, proposalId)).data;
  if (!allStagesApproved(st)) throw new Error("Every stage up to the HEC NOC must be approved first.");
  if (!d.leadId) throw new Error("Choose the Program Lead on the proposal first.");
  const lead = await prisma.user.findFirst({ where: { id: d.leadId, managedById: cid, role: "PROGRAM_COORDINATOR" }, select: { id: true } });
  if (!lead) throw new Error("That Program Lead is not in this institute.");
  const code = d.shortCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (await prisma.degreeProgram.findFirst({ where: { coordinatorId: lead.id, shortCode: code } })) throw new Error(`${code} already exists for this Program Lead.`);
  await prisma.degreeProgram.create({ data: { coordinatorId: lead.id, name: d.programName, shortCode: code, defaultIntakeSize: Number(d.seats) || 30 } });
  const date = (s?: string) => (s ? new Date(s) : null);
  await prisma.programProfile.upsert({
    where: { coordinatorId_degreeProgram: { coordinatorId: lead.id, degreeProgram: d.programName } },
    create: { coordinatorId: lead.id, degreeProgram: d.programName, programLevel: d.level === "UG16" ? "UG16" : null, academicCouncilDate: date(st.AC_date), hecNocDate: date(st.NOC_date) },
    update: { academicCouncilDate: date(st.AC_date), hecNocDate: date(st.NOC_date) },
  }).catch(() => null);
  if (d.departmentId) await qadb.departmentProgram.upsert({ where: { chairmanId_degreeProgram: { chairmanId: cid, degreeProgram: d.programName } }, create: { departmentId: d.departmentId, chairmanId: cid, degreeProgram: d.programName, accreditationBody: ["NCEAC", "NBEAC", "PEC", "HEC"].includes(d.council) ? d.council : null }, update: {} }).catch(() => null);
  await qadb.qaRecord.update({ where: { id: proposalId }, data: { dataJson: JSON.stringify({ ...d, status: "Created" }), updatedById: by, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: by, action: "PROGRAM_CREATED_FROM_PROPOSAL", entityType: "QaRecord", entityId: proposalId, metadata: { program: d.programName } });
  return d.programName;
}

/** Figures the system already holds, for the rankings form. */
export async function rankingFacts(cid: string) {
  const faculty = await prisma.user.findMany({ where: { isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN"] }, OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true } });
  const edu = await prisma.facultyRecord.findMany({ where: { userId: { in: faculty.map((f) => f.id).concat("none") }, kind: "EDUCATION" }, select: { userId: true, title: true } }).catch(() => []);
  const phd = new Set(edu.filter((e) => /ph\.?\s?d|doctor|d\.?b\.?a\b/i.test(e.title)).map((e) => e.userId)).size;
  const pubs = await prisma.facultyRecord.count({ where: { userId: { in: faculty.map((f) => f.id).concat("none") }, kind: "PUBLICATION", endYear: new Date().getFullYear() - 1 } }).catch(() => 0);
  const students = await prisma.student.count({ where: { status: "ACTIVE", batch: { coordinator: { managedById: cid } } } });
  const employers = await prisma.employer.count({ where: { chairmanId: cid } }).catch(() => 0);
  const alumni = await prisma.alumni.count({ where: { chairmanId: cid, graduationYear: new Date().getFullYear() - 1 } }).catch(() => 0);
  return { faculty: faculty.length, phdFaculty: phd, students, employers, graduates: alumni, publications: pubs };
}

/** The annual QA report: counts from every quality register for one year. */
export async function annualReport(cid: string, year: number) {
  const inYear = (s?: string) => !!s && s.startsWith(String(year));
  const [aw, cz, dr, pr, pqr, aff, acts, ipe] = await Promise.all([
    records(cid, "AWARENESS"), records(cid, "CITIZEN"), records(cid, "DEPT_REVIEW"), records(cid, "PROGRAM_PROPOSAL"), records(cid, "PQR"), records(cid, "AFFILIATE"), records(cid, "ACTION"),
    qadb.ipeScore.findMany({ where: { chairmanId: cid } }).catch(() => []) as Promise<{ standard: number; score: number | null }[]>,
  ]);
  const a = (aw || []).filter((r) => inYear(r.data.date));
  const c = (cz || []).filter((r) => inYear(r.data.receivedOn));
  const today = new Date().toISOString().slice(0, 10);
  const scored = ipe.filter((x) => x.score);
  return {
    year,
    awareness: { sessions: a.length, attendees: a.reduce((s, r) => s + (Number(r.data.attendees) || 0), 0), students: a.filter((r) => r.data.audience === "Students").reduce((s, r) => s + (Number(r.data.attendees) || 0), 0) },
    citizen: { received: c.length, closed: c.filter((r) => ["Replied", "Closed"].includes(r.data.status)).length, overdue: c.filter((r) => !["Replied", "Closed"].includes(r.data.status) && r.data.replyBy && r.data.replyBy < today).length },
    reviews: (dr || []).filter((r) => String(r.data.year) === String(year)).length,
    proposals: { total: (pr || []).length, approved: (pr || []).filter((r) => ["Approved", "Created"].includes(r.data.status)).length },
    pqr: { registered: (pqr || []).filter((r) => r.data.status === "Registered").length, total: (pqr || []).length },
    affiliates: { total: (aff || []).length, inspected: (aff || []).filter((r) => inYear(r.data.lastInspection)).length },
    actions: { total: (acts || []).length, done: (acts || []).filter((r) => r.data.status === "Done").length, overdue: (acts || []).filter((r) => r.data.status !== "Done" && r.data.status !== "Dropped" && r.data.due && r.data.due < today).length },
    ipe: { scored: scored.length, avg: scored.length ? Math.round((100 * scored.reduce((s, x) => s + (x.score || 0), 0)) / scored.length) / 100 : null },
  };
}

/** Mondays (cron): the QEC Convener and members hear about overdue Citizen Portal replies, renewals and actions. */
export async function remindQa(now = new Date()) {
  if (now.getUTCDay() !== 1) return 0;
  const t = now.toISOString().slice(0, 10);
  const rows = (await qadb.qaRecord.findMany({ where: { kind: { in: ["CITIZEN", "PQR", "AFFILIATE", "ACTION"] } } }).catch(() => [])) as { chairmanId: string; kind: string; dataJson: string }[];
  const per = new Map<string, number>();
  for (const r of rows) {
    const d = parse(r.dataJson);
    const due = r.kind === "CITIZEN" ? d.replyBy : r.kind === "ACTION" ? d.due : d.renewalDue;
    const done = ["Replied", "Closed", "Done", "Dropped", "Withdrawn", "Expired"].includes(d.status);
    if (due && due < t && !done) per.set(r.chairmanId, (per.get(r.chairmanId) || 0) + 1);
  }
  const { notifyUsers } = await import("./notifications");
  for (const [cid, n] of Array.from(per.entries())) {
    const qec = await prisma.user.findMany({ where: { isActive: true, OR: [{ extraRoles: { has: "QEC_INCHARGE" } }, { extraRoles: { has: "QEC_MEMBER" } }], AND: [{ OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }] }, select: { id: true } });
    await notifyUsers(qec.length ? qec.map((u) => u.id) : [cid], { kind: "DEADLINE", title: `Quality Office: ${n} item(s) overdue`, body: "Citizen Portal replies, PQR / affiliation renewals or actions past their date.", href: "/quality-office" });
  }
  return per.size;
}
