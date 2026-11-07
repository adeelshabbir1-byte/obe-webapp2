// Personal working days (queue item 22), pure: a deadline that falls on a day the person does not work moves to
// their next working day. Days are YYYY-MM-DD in Pakistan time.
export const TZ_MIN = 300;
export const dayKey = (d: Date) => new Date(d.getTime() + TZ_MIN * 60000).toISOString().slice(0, 10);
export const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function parseDays(s: string | null | undefined, fallback = [1, 2, 3, 4, 5]) {
  const d = String(s || "").split(",").map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 6);
  return d.length ? Array.from(new Set(d)).sort() : fallback;
}
export type Cal = { days: number[]; off: Set<string> };
export const works = (c: Cal, key: string) => c.days.includes(new Date(`${key}T00:00:00Z`).getUTCDay()) && !c.off.has(key);
/** The person's due date: unchanged on a working day; otherwise the end of their next working day. */
export function moveDue(due: Date, c: Cal, fixed = false): { due: Date; from: Date | null } {
  if (fixed || !c.days.length) return { due, from: null };
  let key = dayKey(due);
  if (works(c, key)) return { due, from: null };
  for (let i = 0; i < 60; i++) {
    const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); key = d.toISOString().slice(0, 10);
    if (works(c, key)) return { due: new Date(new Date(`${key}T23:59:00Z`).getTime() - TZ_MIN * 60000), from: due };
  }
  return { due, from: null };
}
/** Working days from now until the date, counted on the person's own days (negative when passed). */
export function personalDaysUntil(due: Date, c: Cal, now = new Date()) {
  const a = dayKey(now), b = dayKey(due);
  if (b < a) return -1;
  let n = 0;
  for (let d = new Date(`${a}T00:00:00Z`); d.toISOString().slice(0, 10) < b; d.setUTCDate(d.getUTCDate() + 1)) if (works(c, d.toISOString().slice(0, 10))) n++;
  return n;
}
export const movedText = (from: Date | null) => (from ? ` (moved from ${from.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" })} — not a working day for you)` : "");
