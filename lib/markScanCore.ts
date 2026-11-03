// Scan a mark sheet (3 Nov 2026), pure part: the AI's rows and columns matched to the course's students and
// assessments, every value checked against the item's maximum. Nothing is saved here — the teacher reviews first.
export const normRoll = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normLabel = (s: string) => String(s || "").toLowerCase().replace(/assignment/g, "asg").replace(/assign\b/g, "asg").replace(/midterm|mid-term|mid term/g, "mid").replace(/[^a-z0-9]/g, "");

export type Stu = { id: string; roll: string; name: string };
export type Inst = { id: string; label: string; maxScore: number };
/** A student by roll number: exact, else the one whose roll ends with what is written (sheets often show "014"). */
export function matchStudent(roll: string, students: Stu[]): Stu | null {
  const r = normRoll(roll); if (!r) return null;
  const exact = students.find((s) => normRoll(s.roll) === r); if (exact) return exact;
  const tail = students.filter((s) => normRoll(s.roll).endsWith(r) && r.length >= 2);
  return tail.length === 1 ? tail[0] : null;
}
/** A column heading to an assessment: the same label, else one label containing the other (only when unique). */
export function matchColumn(head: string, insts: Inst[]): Inst | null {
  const h = normLabel(head); if (!h) return null;
  const exact = insts.find((i) => normLabel(i.label) === h); if (exact) return exact;
  const part = insts.filter((i) => { const l = normLabel(i.label); return l.includes(h) || h.includes(l); });
  return part.length === 1 ? part[0] : null;
}
export type Cell = { value: number | null; absent: boolean; error: string | null };
export function readCell(v: unknown, max: number | null): Cell {
  if (v === null || v === undefined || String(v).trim() === "") return { value: null, absent: false, error: null };
  if (/^\s*(a|ab|abs|absent)\s*$/i.test(String(v))) return { value: null, absent: true, error: null };
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return { value: null, absent: false, error: `"${v}" is not a mark` };
  if (n < 0 || (max !== null && n > max)) return { value: n, absent: false, error: `${n} is outside 0–${max}` };
  return { value: n, absent: false, error: null };
}
export function preview(ai: { columns: string[]; rows: { roll: string; name?: string; values: unknown[] }[] }, students: Stu[], insts: Inst[]) {
  const cols = ai.columns.map((h) => ({ head: h, inst: matchColumn(h, insts) }));
  const seen = new Set<string>();
  const rows = ai.rows.map((r) => {
    const s = matchStudent(r.roll, students);
    const dup = s ? seen.has(s.id) : false; if (s) seen.add(s.id);
    return { roll: r.roll, name: r.name || "", student: s, duplicate: dup, cells: cols.map((c, i) => readCell(r.values[i], c.inst ? c.inst.maxScore : null)) };
  });
  const missing = students.filter((s) => !seen.has(s.id)).map((s) => s.roll);
  return { cols, rows, missing, unmatched: rows.filter((r) => !r.student).length, errors: rows.reduce((a, r) => a + r.cells.filter((c) => c.error).length, 0) };
}
