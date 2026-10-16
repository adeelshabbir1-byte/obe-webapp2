// The three accreditation councils and the council a program's name points to. No database access, so the pass-mark
// lookup (lib/passingCriteria.ts) and the browser can use it without pulling in the readiness engine.

export type BodyKey = "NCEAC" | "NBEAC" | "HEC";
export const BODY_KEYS: BodyKey[] = ["NCEAC", "NBEAC", "HEC"];

export const BODIES: Record<BodyKey, { key: BodyKey; name: string; scope: string; framework: string; groupLabel: string }> = {
  NCEAC: { key: "NCEAC", name: "National Computing Education Accreditation Council", scope: "Computing programs (BS CS, SE, AI, DS, Cyber Security, IT)", framework: "NCEAC Accreditation Manual — the nine criteria", groupLabel: "Criterion" },
  NBEAC: { key: "NBEAC", name: "National Business Education Accreditation Council", scope: "Business and management programs (BBA, MBA, Accounting & Finance, Executive MBA)", framework: "NBEAC Self-Assessment Report 4.0 — Forms 1 to 7", groupLabel: "Form" },
  HEC: { key: "HEC", name: "Higher Education Commission — Quality Assurance", scope: "General and basic sciences programs", framework: "HEC Self-Assessment Manual — the eight criteria", groupLabel: "Criterion" },
};
export const isBody = (v: unknown): v is BodyKey => typeof v === "string" && (BODY_KEYS as string[]).includes(v);

const COMPUTING = /\b(comput\w*|software|artificial intelligence|data science|cyber|information technology|information security|bioinformatics|BSCS|BSSE|BSAI|BSDS|BSIT)\b|\bBS\s*\(?(CS|SE|AI|DS|IT)\)?\b/i;
const BUSINESS = /\b(business|BBA|MBA|EMBA|accounting|finance|banking|commerce|B\.?\s?Com|M\.?\s?Com|management|marketing|human resource|supply chain|entrepreneurship)\b/i;

/** The council a program's name points to (a suggestion until the Institute Head confirms it). */
export function inferBody(program: string): BodyKey {
  if (COMPUTING.test(program)) return "NCEAC";
  if (BUSINESS.test(program)) return "NBEAC";
  return "HEC";
}

