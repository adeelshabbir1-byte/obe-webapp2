import { prisma } from "./db";
export const cdb = prisma as unknown as Record<string, any>;

// Attributes of complex problems (Washington Accord WP1-WP7; the Seoul Accord's complex computing problems use the same
// pattern). WP1 must always be present plus some of the rest. Check the wording against your council's current manual.
export const ATTRS: [string, string][] = [
  ["P1", "Depth of knowledge required (cannot be solved without in-depth knowledge) — required"],
  ["P2", "Range of conflicting requirements"], ["P3", "Depth of analysis required (no obvious solution; abstract thinking, original analysis)"],
  ["P4", "Familiarity of issues (infrequently encountered)"], ["P5", "Extent of applicable codes / standards"],
  ["P6", "Extent of stakeholder involvement and conflicting requirements"], ["P7", "Interdependence (high-level problem with many component parts)"],
];
export const KNOWLEDGE: Record<"PEC" | "NCEAC", [string, string][]> = {
  PEC: [["WK1", "Natural sciences"], ["WK2", "Mathematics, numerical analysis, statistics, computing"], ["WK3", "Engineering fundamentals"], ["WK4", "Specialist engineering knowledge"], ["WK5", "Engineering design"], ["WK6", "Engineering practice (technology)"], ["WK7", "Engineering in society (ethics, environment, economics)"], ["WK8", "Research literature"]],
  NCEAC: [["CK1", "Mathematics and statistics"], ["CK2", "Computing fundamentals"], ["CK3", "Specialist computing knowledge"], ["CK4", "Computing design and development"], ["CK5", "Computing practice (tools and technology)"], ["CK6", "Computing in society (ethics, law, professional practice)"], ["CK7", "Research literature"]],
};
export const parseArr = (j: string | null | undefined) => { try { return JSON.parse(j || "[]") as string[]; } catch { return [] as string[]; } };
