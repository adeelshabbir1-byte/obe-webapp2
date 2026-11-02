// Who does which affiliation step at the university (pure). The Institute Head names people for each job; a step can
// only be taken by a holder of its job (or the Institute Head). A job nobody holds yet falls back to the Affiliation
// office and the university's heads, so nothing is blocked before the jobs are handed out.
export const JOBS: Record<string, { label: string; does: string }> = {
  OFFICE: { label: "Affiliation office", does: "Scrutiny, visit dates, faculty approvals, council accreditation records" },
  INSPECTOR: { label: "Inspectors", does: "Inspection visits and reports (scores, remarks)" },
  COMMITTEE: { label: "Affiliation Committee", does: "Recommends approve / conditional / refuse; declares centres" },
  AUTHORITY: { label: "Final authority (Syndicate / VC / Academic Council)", does: "Final approval of affiliation; disaffiliation decisions" },
  REGISTRAR: { label: "Registrar", does: "Notices and circulars, migrations, examiner rates, closing disaffiliation" },
  CONTROLLER: { label: "Controller of Examinations", does: "Examiners, sessions and agreed marks, grievances, final papers, coded marking, re-checks, verifying claims" },
  TREASURER: { label: "Treasurer", does: "Claim approval and payment, college fees, tax" },
};
const MOVE: Record<string, Record<string, string>> = {
  APPLICATION: { SCRUTINY: "OFFICE", DOCS_NEEDED: "OFFICE", VISIT_SET: "OFFICE", INSPECTED: "INSPECTOR", RECOMMENDED: "COMMITTEE", APPROVED: "AUTHORITY", CONDITIONAL: "AUTHORITY", REFUSED: "COMMITTEE" },
  CENTRE: { "*": "COMMITTEE" }, EXAMINER: { "*": "CONTROLLER" }, SESSION: { "*": "CONTROLLER" },
  CLAIM: { VERIFIED: "CONTROLLER", REFUSED: "CONTROLLER", APPROVED: "TREASURER", PAID: "TREASURER" },
  NOTICE: { "*": "REGISTRAR" }, FACULTY: { "*": "OFFICE" }, FEE: { "*": "TREASURER" }, MIGRATION: { "*": "REGISTRAR" },
  ACCREDITATION: { "*": "OFFICE" }, RECHECK: { "*": "CONTROLLER" }, FINAL_PAPER: { "*": "CONTROLLER" }, MARKING: { "*": "CONTROLLER" },
  DISAFFILIATION: { DECIDED: "AUTHORITY", COMPLETED: "REGISTRAR" },
};
const KIND: Record<string, string> = { APPLICATION: "OFFICE", CENTRE: "COMMITTEE", EXAMINER: "CONTROLLER", SESSION: "CONTROLLER", CLAIM: "CONTROLLER", NOTICE: "REGISTRAR", FACULTY: "OFFICE", FEE: "TREASURER", MIGRATION: "REGISTRAR", ACCREDITATION: "OFFICE", RECHECK: "CONTROLLER", FINAL_PAPER: "CONTROLLER", MARKING: "CONTROLLER", DISAFFILIATION: "AUTHORITY" };
// University-side fields of an application belong to different jobs.
const FIELD: Record<string, string> = { visitDate: "OFFICE", team: "OFFICE", score: "INSPECTOR", report: "INSPECTOR", conditions: "COMMITTEE", authority: "AUTHORITY", validUntil: "AUTHORITY" };
export const jobForMove = (kind: string, to: string) => MOVE[kind]?.[to] || MOVE[kind]?.["*"] || KIND[kind] || "OFFICE";
export const jobForKind = (kind: string) => KIND[kind] || "OFFICE";
export const jobForField = (kind: string, field: string) => (kind === "APPLICATION" && FIELD[field]) || jobForKind(kind);
export type Holder = { userId: string; name: string };
/** May this person do a job? Heads always may; holders may; an empty job falls back to `fallback` (office / heads). */
export function may(job: string, user: { id: string; role: string; extraRoles?: string[] | null }, jobs: Record<string, Holder[]>, fallback: boolean) {
  if (user.role === "CHAIRMAN") return true;
  const holders = jobs[job] || [];
  if (holders.some((h) => h.userId === user.id)) return true;
  if (job === "CONTROLLER" && !holders.length && (user.extraRoles || []).includes("EXAM_CONTROLLER")) return true;
  return !holders.length && fallback;
}
export const holdersText = (job: string, jobs: Record<string, Holder[]>) => `${JOBS[job]?.label || job}${(jobs[job] || []).length ? ` (${(jobs[job] || []).map((h) => h.name).join(", ")})` : ""}`;
