// Semester readiness board: the colour of each cell and when a program counts as ready. No database (tested alone).

export type Light = "green" | "amber" | "red";
export type Cell = { light: Light; text: string; href?: string | null; missing?: string[] };
export const COLUMNS = [
  { key: "setup", label: "Set-up done" }, { key: "plans", label: "SE plans approved" }, { key: "instructors", label: "Instructors assigned" },
  { key: "sections", label: "Sections made" }, { key: "timetable", label: "Timetable done" }, { key: "registration", label: "Registration open" },
] as const;
export type ColKey = (typeof COLUMNS)[number]["key"];

/** x of y: green when all, red when none, amber in between (nothing to do counts as green). */
export function share(done: number, total: number, href?: string | null, missing?: string[]): Cell {
  if (total === 0) return { light: "green", text: "—", href: null };
  return { light: done >= total ? "green" : done === 0 ? "red" : "amber", text: `${done} of ${total}`, href: done >= total ? null : href || null, missing };
}
const RANK: Record<Light, number> = { red: 0, amber: 1, green: 2 };
/** A program's cell: the worst of its batches, the counts added up. */
export function worst(cells: Cell[]): Cell {
  if (!cells.length) return { light: "green", text: "—" };
  const w = cells.slice().sort((a, b) => RANK[a.light] - RANK[b.light])[0];
  const nums = cells.map((c) => /^(\d+) of (\d+)$/.exec(c.text)).filter(Boolean) as RegExpExecArray[];
  const text = nums.length === cells.length ? `${nums.reduce((s, m) => s + Number(m[1]), 0)} of ${nums.reduce((s, m) => s + Number(m[2]), 0)}` : w.text;
  return { ...w, text };
}
export const isReady = (cells: Partial<Record<ColKey, Cell>>) => COLUMNS.every((c) => (cells[c.key]?.light || "green") === "green");
/** "Fall 2026 starts in 23 days · 2 of 5 programs ready". */
export function topLine(term: string, start: Date | null, ready: number, total: number, now = new Date()) {
  const days = start ? Math.ceil((start.getTime() - now.getTime()) / 864e5) : null;
  const when = days === null ? `${term}: start date not set` : days > 0 ? `${term} starts in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? `${term} starts today` : `${term} started ${-days} day${days === -1 ? "" : "s"} ago`;
  return `${when} · ${ready} of ${total} program${total === 1 ? "" : "s"} ready`;
}
