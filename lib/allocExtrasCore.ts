import type { PRow } from "./yearPlan";

// Allocation extras (Adeel prompt, still open): the preference window, "what if" on the year plan, and mentors for a
// teacher's first time on a course. Pure helpers.

export type Window = { opens: string; closes: string; note?: string };
/** OPEN / NOT_YET / CLOSED; with no window set, preferences stay open as before. */
export function windowState(w: Window | null, now = new Date()): { state: "OPEN" | "NOT_YET" | "CLOSED" | "NONE"; text: string } {
  if (!w || !w.opens || !w.closes) return { state: "NONE", text: "" };
  const o = new Date(`${w.opens}T00:00:00`), c = new Date(`${w.closes}T23:59:59`);
  if (now < o) return { state: "NOT_YET", text: `Course preferences open on ${w.opens} and close on ${w.closes}.` };
  if (now > c) return { state: "CLOSED", text: `The preference window closed on ${w.closes}. Ask the Course Assigner if something changed.` };
  return { state: "OPEN", text: `Course preferences are open until ${w.closes}.` };
}

export type Cand = { id: string; name: string; cap: number; wants: Set<string>; taught: Set<string> };
export type WhatIf = {
  before: { term: string; need: number; done: number }[]; after: { term: string; need: number; done: number }[];
  open: { key: string; term: string; code: string; title: string; batch: string; missing: number; suggest: { id: string; name: string; spare: number; why: string }[] }[];
};

const covered = (r: PRow) => Math.min(r.sections, r.teachers.reduce((a, t) => a + t.n, 0) + r.visiting);
const termTotals = (rows: PRow[]) => {
  const by = new Map<string, { term: string; need: number; done: number }>();
  for (const r of rows) { const o = by.get(r.term) || { term: r.term, need: 0, done: 0 }; o.need += r.sections; o.done += covered(r); by.set(r.term, o); }
  return Array.from(by.values());
};

/** What happens to the year if a teacher is away (leave, resignation): sections left open and who could take them. */
export function whatIfAway(rows: PRow[], teacherId: string, pool: Cand[]): WhatIf {
  const after: PRow[] = rows.map((r) => ({ ...r, teachers: r.teachers.filter((t) => t.id !== teacherId) }));
  const load = new Map<string, number>();
  for (const r of after) for (const t of r.teachers) load.set(`${r.term}|${t.id}`, (load.get(`${r.term}|${t.id}`) || 0) + t.n);
  const open = after.filter((r) => covered(r) < r.sections && rows.find((x) => x.key === r.key)!.teachers.some((t) => t.id === teacherId)).map((r) => {
    const code = r.code.toUpperCase();
    const suggest = pool.filter((c) => c.id !== teacherId).map((c) => ({ c, spare: c.cap - (load.get(`${r.term}|${c.id}`) || 0) }))
      .filter((x) => x.spare > 0 && (x.c.wants.has(code) || x.c.taught.has(code)))
      .sort((a, b) => Number(b.c.wants.has(code)) - Number(a.c.wants.has(code)) || Number(b.c.taught.has(code)) - Number(a.c.taught.has(code)) || b.spare - a.spare)
      .slice(0, 4).map((x) => ({ id: x.c.id, name: x.c.name, spare: x.spare, why: [x.c.wants.has(code) ? "asked for it" : "", x.c.taught.has(code) ? "has taught it" : ""].filter(Boolean).join(", ") }));
    return { key: r.key, term: r.term, code: r.code, title: r.title, batch: r.batch, missing: r.sections - covered(r), suggest };
  });
  return { before: termTotals(rows), after: termTotals(after), open };
}

/** Teacher × course pairs in the plan that the teacher has never taught. */
export function firstTimers(rows: PRow[], taught: Set<string>) {
  const out = new Map<string, { teacherId: string; teacher: string; code: string; title: string }>();
  for (const r of rows) for (const t of r.teachers) { const k = `${t.id}|${r.code.toUpperCase()}`; if (!taught.has(k) && !out.has(k)) out.set(k, { teacherId: t.id, teacher: t.name, code: r.code.toUpperCase(), title: r.title }); }
  return Array.from(out.values());
}
