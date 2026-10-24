import { titleKey } from "./curriculumContent";
import { PU_BSCS_2021 } from "./puBscs2021";

// Courses that are the same course under different names in different curricula (PU, HEC 2025, NCEAC 2023 …).
// Each group is one course; comparing two curricula matches courses through these groups, then by title.
const GROUPS: string[][] = [
  ...PU_BSCS_2021.map((c) => [c.title, c.hec2025, c.nceac2023].filter((x): x is string => !!x)),
  ["Final Year Project", "Final Year Project I", "Final Year Project - I"],
];
const strip = (s: string) => titleKey(s.replace(/\s*-\s*(I|II)$/i, " $1"));
const GROUP = new Map<string, number>();
GROUPS.forEach((g, i) => g.forEach((t) => { if (!GROUP.has(strip(t))) GROUP.set(strip(t), i); }));
/** Keys under which equivalent courses of different curricula meet, most specific first:
 *  "Quantitative Reasoning I (Discrete Structures)" meets "Discrete Structures" and "Quantitative Reasoning I". */
export function courseKeys(title: string) {
  const inner = title.match(/\(([^)]+)\)/)?.[1];
  const outer = title.replace(/\s*\([^)]*\)/g, "").trim();
  const ks: string[] = [];
  for (const t of [inner, title, outer]) if (t) { const k = strip(t); if (GROUP.has(k)) ks.push(`g${GROUP.get(k)}`); ks.push(k); }
  return Array.from(new Set(ks));
}
