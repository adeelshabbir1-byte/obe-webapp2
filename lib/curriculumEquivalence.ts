import { titleKey } from "./curriculumContent";
import { PU_BSCS_2021 } from "./puBscs2021";

// Courses that are the same course under different names. Kept per council version and never combined: PU is
// mapped to the 2025 curriculum (HEC/NCEAC 2025) with the 2025 table and to NCEAC 2023 with the 2023 table, so a
// 2023 title can never bridge a 2025 mapping (or the other way round).
type Edition = "2025" | "2023";
const TABLES: Record<Edition, string[][]> = {
  "2025": [...PU_BSCS_2021.filter((c) => c.hec2025).map((c) => [c.title, c.hec2025!])],
  "2023": [...PU_BSCS_2021.filter((c) => c.nceac2023).map((c) => [c.title, c.nceac2023!])],
};
const strip = (s: string) => titleKey(s.replace(/\s*-\s*(I|II)$/i, " $1"));
const GROUPS: Record<Edition, Map<string, number>> = { "2025": new Map(), "2023": new Map() };
(Object.keys(TABLES) as Edition[]).forEach((e) => TABLES[e].forEach((g, i) => g.forEach((t) => { if (!GROUPS[e].has(strip(t))) GROUPS[e].set(strip(t), i); })));

/** Which table applies when comparing two curricula: the council edition one of them is (2025 or 2023). Two
 *  different editions (2023 vs 2025) get no table — they meet on identical titles only. */
export function editionFor(a: string, b: string): Edition | null {
  const ed = (v: string) => (/2025/.test(v) ? "2025" : /2023/.test(v) ? "2023" : null);
  const x = ed(a), y = ed(b);
  if (x && y) return x === y ? x : null;
  return x || y;
}

/** Keys under which equivalent courses meet, most specific first:
 *  "Quantitative Reasoning I (Discrete Structures)" meets "Discrete Structures" and "Quantitative Reasoning I". */
export function courseKeys(title: string, edition: Edition | null) {
  const G = edition ? GROUPS[edition] : null;
  const inner = title.match(/\(([^)]+)\)/)?.[1];
  const outer = title.replace(/\s*\([^)]*\)/g, "").trim();
  const ks: string[] = [];
  for (const t of [inner, title, outer]) if (t) { const k = strip(t); if (G?.has(k)) ks.push(`g${G.get(k)}`); ks.push(k); }
  return Array.from(new Set(ks));
}
