// The accreditation councils and the council a program's name points to. No database access, so the pass-mark
// lookup (lib/passingCriteria.ts) and the browser can use it without pulling in the readiness engine.

export type BodyKey = "NCEAC" | "NBEAC" | "PEC" | "HEC";
export const BODY_KEYS: BodyKey[] = ["NCEAC", "NBEAC", "PEC", "HEC"];

export const BODIES: Record<BodyKey, { key: BodyKey; name: string; scope: string; framework: string; groupLabel: string }> = {
  NCEAC: { key: "NCEAC", name: "National Computing Education Accreditation Council", scope: "Computing programs (BS CS, SE, AI, DS, Cyber Security, IT)", framework: "NCEAC Accreditation Manual — the nine criteria", groupLabel: "Criterion" },
  NBEAC: { key: "NBEAC", name: "National Business Education Accreditation Council", scope: "Business and management programs (BBA, MBA, Accounting & Finance, Executive MBA)", framework: "NBEAC Self-Assessment Report 4.0 — Forms 1 to 7", groupLabel: "Form" },
  PEC: { key: "PEC", name: "Pakistan Engineering Council — Engineering Accreditation Board", scope: "Engineering programs (BE / BSc Engineering: electrical, mechanical, civil, chemical, computer engineering and others)", framework: "PEC Manual of Accreditation (outcome-based) — criteria and the 12 Graduate Attributes", groupLabel: "Criterion" },
  HEC: { key: "HEC", name: "Higher Education Commission — Quality Assurance", scope: "General and basic sciences programs", framework: "HEC Self-Assessment Manual — the eight criteria", groupLabel: "Criterion" },
};
export const isBody = (v: unknown): v is BodyKey => typeof v === "string" && (BODY_KEYS as string[]).includes(v);

const COMPUTING = /\b(comput\w*|software|artificial intelligence|data science|cyber|information technology|information security|bioinformatics|BSCS|BSSE|BSAI|BSDS|BSIT)\b|\bBS\s*\(?(CS|SE|AI|DS|IT)\)?\b/i;
const ENGINEERING = /\b(engineering|B\.?E\.?|B\.?Sc\.? ?Eng\w*|electrical|mechanical|civil|chemical|mechatronics|electronics|telecom\w*|petroleum|metallurg\w*|industrial engineering)\b/i;
const BUSINESS = /\b(business|BBA|MBA|EMBA|accounting|finance|banking|commerce|B\.?\s?Com|M\.?\s?Com|management|marketing|human resource|supply chain|entrepreneurship)\b/i;

/** The council a program's name points to (a suggestion until the Institute Head confirms it). */
export function inferBody(program: string): BodyKey {
  if (/computer (systems )?engineering/i.test(program)) return "PEC";
  if (COMPUTING.test(program)) return "NCEAC";
  if (ENGINEERING.test(program)) return "PEC";
  if (BUSINESS.test(program)) return "NBEAC";
  return "HEC";
}

