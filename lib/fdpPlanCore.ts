// FDP trainings that run over several days: the days and their times (the same every day, or per day), the hours they
// add up to, and what the university provides. No database here (tested on its own).

export type Day = { date: string; start: string; end: string };
export type Provisions = { transport?: string; food?: string; residence?: string; tada?: string; registrationFee?: string; onDuty: boolean; notes?: string };
export type Plan = { startDate: string; endDate: string; same: boolean; start: string; end: string; days: Day[]; provisions: Provisions };

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Every date from start to end (inclusive), at most 60. */
export function datesBetween(start: string, end: string) {
  const a = new Date(`${start}T00:00:00Z`), b = new Date(`${end}T00:00:00Z`);
  if (isNaN(+a) || isNaN(+b) || b < a) return [];
  const out: string[] = [];
  for (let d = a; d <= b && out.length < 60; d = new Date(d.getTime() + 864e5)) out.push(iso(d));
  return out;
}
/** The days of a plan: the same times every day, or the times set per day (a day without its own times takes the default). */
export function daysOf(p: Pick<Plan, "startDate" | "endDate" | "same" | "start" | "end" | "days">): Day[] {
  return datesBetween(p.startDate, p.endDate).map((date) => {
    const own = !p.same ? p.days.find((d) => d.date === date) : undefined;
    return { date, start: own?.start || p.start, end: own?.end || p.end };
  });
}
/** Problems with the plan (none = it can be saved). */
export function checkPlan(p: Plan): string[] {
  const out: string[] = [];
  if (!datesBetween(p.startDate, p.endDate).length) out.push("The end date must be on or after the start date.");
  for (const d of daysOf(p)) { const s = toMin(d.start), e = toMin(d.end); if (s === null || e === null) out.push(`${d.date}: give the start and end time.`); else if (e <= s) out.push(`${d.date}: the end time must be after the start time.`); }
  return out;
}
/** Hours of the whole training, from its days (to the quarter hour). */
export const planHours = (p: Plan) => Math.round(daysOf(p).reduce((s, d) => s + Math.max(0, ((toMin(d.end) ?? 0) - (toMin(d.start) ?? 0)) / 60), 0) * 4) / 4;
export const PROVISION_LABEL: Record<keyof Omit<Provisions, "onDuty" | "notes">, string> = { transport: "Transport", food: "Food", residence: "Residence (out of city)", tada: "TA/DA", registrationFee: "Registration fee" };
export const fmtTime = (t: string) => { const m = toMin(t); if (m === null) return t; const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
