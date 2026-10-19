import { randomUUID } from "crypto";
import { prisma } from "../db";
import { aasSettings } from "../aas";
import { termIndex } from "../termLogic";

// Each council's accreditation process (NCEAC Manual 2023 Figure 1, PEC Manual 2019 Section 2, NBEAC Process Manual 2026) as a tracker for one visit cycle: each step's status, the date it
// was done, and the date it is expected — worked out from the step before it with typical gaps (editable). Steps the
// system can see (focal person registered, visit date set and passed) are filled in by themselves.

const pdb = prisma as unknown as Record<string, any>;
export const FLOW_HINT = "The process tracker needs prisma/migration_process_flow.sql — run it in Supabase.";

export type StepDef = { key: string; title: string; who: string; days: number; note?: string };
export const NCEAC_FLOW: StepDef[] = [
  { key: "focal", title: "Focal person registered on AAS", who: "Dean / Registrar e-mails NCEAC", days: 0, note: "One focal person per institute; NCEAC creates the AAS login." },
  { key: "entry", title: "Focal person enters university, department, program, faculty and student information", who: "Focal person (AAS)", days: 30 },
  { key: "submit", title: "Information submitted to NCEAC with the accreditation fee", who: "Focal person", days: 7, note: "First accreditation: when students reach the 7th semester. Re-accreditation: six months before the accreditation expires." },
  { key: "desk", title: "NCEAC performs the desk audit", who: "NCEAC", days: 30, note: "Missing or incomplete information goes back to data entry." },
  { key: "visit", title: "NCEAC Accreditation Inspection Committee (AIC) visits the university", who: "AIC", days: 45, note: "The institute proposes several dates; the date is agreed with NCEAC and the AIC." },
  { key: "aicReport", title: "AIC submits its report to NCEAC", who: "AIC convener", days: 14 },
  { key: "shared", title: "AIC report shared with the university", who: "NCEAC", days: 14 },
  { key: "response", title: "University responds to the AIC report (rejoinder)", who: "Department / focal person", days: 14 },
  { key: "council", title: "AIC report and the university's response placed before the NCEAC General Council", who: "NCEAC General Council", days: 60 },
  { key: "decision", title: "General Council decision shared with the university", who: "NCEAC", days: 14 },
];

// PEC Manual of Accreditation 2019, Section 2 (process generally six to nine months).
export const PEC_FLOW: StepDef[] = [
  { key: "apply", title: "Application with the SAR, dossier and fee submitted to PEC", who: "Institution", days: 0, note: "First accreditation: SAR before the 7th semester starts. Re-accreditation: in the last year, not later than six months before expiry." },
  { key: "scrutiny", title: "PEC (EAD) scrutinises the application against the qualifying requirements", who: "PEC Secretariat", days: 30, note: "PEC may ask for more information." },
  { key: "team", title: "EAB names the Program Evaluation Team (convener, two PEVs per program, PEC official)", who: "EAB", days: 30, note: "A conflict of interest with a PEV can be raised within a week of receiving the schedule." },
  { key: "visit", title: "Program Evaluation Team visits (two days; three for several programs)", who: "Visiting team", days: 30 },
  { key: "report", title: "Visit report submitted to EAB; copy sent to the institution", who: "Convener / EAD", days: 21 },
  { key: "rejoinder", title: "Institution's rejoinder on the report", who: "Institution", days: 14, note: "No rejoinder by the due date counts as agreeing with the observations." },
  { key: "review", title: "EAB reviews the report and rejoinder", who: "EAB", days: 45 },
  { key: "decision", title: "EAB accreditation decision (5 years, less than 5, deferred up to 1 year, or not accredited)", who: "EAB decision meeting", days: 30 },
  { key: "notified", title: "Decision notified to the institution, on the PEC website and in the Gazette", who: "PEC", days: 21, note: "Appeal within 30 days of notification." },
];

// NBEAC Accreditation Process Manual 2026.
export const NBEAC_FLOW: StepDef[] = [
  { key: "register", title: "Registration: online application and registration fee", who: "Focal person / HoD", days: 0, note: "At least one month before the Eligibility Screening Committee meeting." },
  { key: "screen", title: "Secretariat checks the application against the eligibility policy", who: "NBEAC Secretariat", days: 21 },
  { key: "preMentor", title: "Pre-eligibility mentoring (first-time schools)", who: "NBEAC mentor", days: 120, note: "Normally up to six months." },
  { key: "esc", title: "Eligibility Screening Committee decision (IES letter)", who: "ESC", days: 30, note: "If eligible, the SAR is due within three months (one extension)." },
  { key: "sar", title: "SAR prepared with the mentor; mentor's terminal report clears the PRT visit", who: "School / mentor", days: 90 },
  { key: "desk", title: "SAR desk review; six hard copies and the accreditation fee sent", who: "Secretariat / focal person", days: 21 },
  { key: "visit", title: "Peer Review Team (PRT) visit — 2.5 days", who: "PRT", days: 30, note: "Thirty days or later after the SAR copies arrive." },
  { key: "prt", title: "PRT report submitted to the Secretariat", who: "PRT chair", days: 14, note: "Within two weeks of the visit." },
  { key: "feedback", title: "School flags factual errors in the interim report", who: "School", days: 7, note: "One week; factual errors only." },
  { key: "aac", title: "Accreditation Award Committee review", who: "AAC", days: 60, note: "Meets at least twice a year." },
  { key: "council", title: "NBEAC Council decision (full 5 years, provisional 3, or deferred)", who: "NBEAC Council", days: 30 },
  { key: "notified", title: "Decision notified in writing", who: "Secretariat", days: 28, note: "Within four weeks of the decision. Appeal within thirty days." },
];

export const FLOWS: Record<string, StepDef[]> = { NCEAC: NCEAC_FLOW, PEC: PEC_FLOW, NBEAC: NBEAC_FLOW };
export const FLOW_SOURCE: Record<string, string> = { NCEAC: "NCEAC Accreditation Manual 2023, Figure 1", PEC: "PEC Manual of Accreditation 2019, Section 2", NBEAC: "NBEAC Accreditation Process Manual 2026" };
export const flowOf = (body: string) => FLOWS[body] || null;

export type StepRow = { key: string; status: "DONE" | "CURRENT" | "PENDING" | "RETURNED"; doneOn: string | null; expected: string | null; note: string | null; auto?: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

export async function processStatus(cycleId: string) {
  const c = await prisma.accreditationCycle.findUnique({ where: { id: cycleId } });
  if (!c) return null;
  let saved: { stepKey: string; status: string; doneOn: Date | null; expectedOn: Date | null; note: string | null }[] = [];
  let missing = false;
  try { saved = await pdb.accreditationStep.findMany({ where: { cycleId } }); } catch { missing = true; }
  const flow = flowOf(c.body);
  if (!flow) return null;
  const auto = new Map<string, { done: boolean; on?: Date; text: string }>();
  const aas = c.body === "NCEAC" ? await aasSettings(c.chairmanId).catch(() => null) : null;
  if (aas?.focalId) { const u = await prisma.user.findUnique({ where: { id: aas.focalId }, select: { name: true } }); auto.set("focal", { done: true, text: `Focal person: ${u?.name || "set"} (AAS page)` }); }
  if (c.visitDate) auto.set("visit", { done: c.visitDate.getTime() < Date.now(), on: c.visitDate, text: `Visit date ${iso(c.visitDate)} (visit settings)` });
  // When to apply: first accreditation when the oldest batch reaches its 7th semester.
  const lead = await prisma.batch.findFirst({ where: { coordinatorId: c.leadId, degreeProgram: c.program }, orderBy: [{ startYear: "asc" }], select: { startTerm: true, startYear: true, batchName: true } });
  let applyBy: string | null = null;
  if (lead && c.body !== "NBEAC" && /fall|spring/i.test(lead.startTerm)) { const i = termIndex(lead.startTerm, lead.startYear) + 6; const t = i % 2 === 0 ? { n: "Fall", y: i / 2 } : { n: "Spring", y: (i + 1) / 2 }; applyBy = c.body === "PEC" ? `before ${t.n} ${t.y} starts (SAR before batch ${lead.batchName}'s 7th semester)` : `${t.n} ${t.y} (batch ${lead.batchName} in its 7th semester)`; }

  const rows: StepRow[] = [];
  let anchor: Date = c.createdAt;
  let currentSet = false;
  for (const st of flow) {
    const s = saved.find((x) => x.stepKey === st.key);
    const a = auto.get(st.key);
    let status = (s?.status as StepRow["status"]) || (a?.done ? "DONE" : "PENDING");
    const doneOn = s?.doneOn || (a?.done ? a.on || null : null);
    const expected = s?.expectedOn || (st.key === "visit" && c.visitDate ? c.visitDate : add(anchor, st.days));
    if (status !== "DONE" && !currentSet) { if (status === "PENDING") status = "CURRENT"; currentSet = true; }
    rows.push({ key: st.key, status, doneOn: doneOn ? iso(new Date(doneOn)) : null, expected: status === "DONE" ? null : iso(new Date(expected)), note: s?.note || null, auto: a?.text });
    anchor = status === "DONE" && doneOn ? new Date(doneOn) : new Date(expected);
  }
  const cur = rows.find((r) => r.status === "CURRENT" || r.status === "RETURNED");
  return { body: c.body, flow, source: FLOW_SOURCE[c.body], rows, missing, applyBy, current: cur ? flow.find((s) => s.key === cur.key)!.title : null, finish: rows[rows.length - 1].status === "DONE" ? null : rows[rows.length - 1].expected };
}

export async function saveStep(cycleId: string, key: string, d: { status: string; doneOn: string | null; expectedOn: string | null; note: string | null }, by: string) {
  const v = (x: string | null) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(x + "T00:00:00Z") : null);
  const data = { status: ["DONE", "CURRENT", "PENDING", "RETURNED"].includes(d.status) ? d.status : "PENDING", doneOn: v(d.doneOn), expectedOn: v(d.expectedOn), note: d.note, updatedById: by, updatedAt: new Date() };
  await pdb.accreditationStep.upsert({ where: { cycleId_stepKey: { cycleId, stepKey: key } }, create: { id: randomUUID(), cycleId, stepKey: key, ...data }, update: data });
  // Missing information at the desk audit sends the cycle back to data entry.
  const back: Record<string, string[]> = { desk: ["entry", "submit"], scrutiny: ["apply"], screen: ["register"] };
  if (data.status === "RETURNED" && back[key]) for (const k of back[key]) await pdb.accreditationStep.upsert({ where: { cycleId_stepKey: { cycleId, stepKey: k } }, create: { id: randomUUID(), cycleId, stepKey: k, status: "PENDING", updatedById: by, updatedAt: new Date() }, update: { status: "PENDING", doneOn: null, updatedById: by, updatedAt: new Date() } });
}
