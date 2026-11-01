// Visiting pay rules (Prompt 10, section 10), with no database (tested on its own): late arrival by the biometric "in"
// time against the class start plus grace, the deduction options, the income-tax table, the pay sheet and pay periods.

export type LateMode = "FIXED" | "PCT" | "MINUTES" | "COUNT";
export type LateRule = { graceMin: number; mode: LateMode; fixed: number; pct: number; everyN: number };
export type TaxTable = { mode: "PCT" | "SLABS"; filerPct: number; nonFilerPct: number; slabs: { upTo: number | null; filerPct: number; nonFilerPct: number }[] };
export const LATE_MODES: [LateMode, string][] = [["FIXED", "A fixed amount per late"], ["PCT", "A % of that class's pay"], ["MINUTES", "Pay only for the minutes present"], ["COUNT", "Every X lates = one class deducted"]];

export const toMin = (t: string | null | undefined) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** Late when the biometric "in" is after the class start plus the grace minutes; minutes late counted from the start. */
export function lateOf(start: string | null | undefined, inAt: string | null | undefined, graceMin: number) {
  const s = toMin(start), i = toMin(inAt);
  if (s === null || i === null) return { late: false, minutes: 0 };
  return { late: i > s + graceMin, minutes: Math.max(0, i - s) };
}

export type PayLine = { minutes: number; lateMinutes: number; late: boolean };
/** Deductions for late arrivals under the institute's rule (rate = pay per hour). */
export function deductionsOf(lines: PayLine[], rate: number, r: LateRule) {
  const late = lines.filter((l) => l.late);
  const classPay = (l: PayLine) => (l.minutes / 60) * rate;
  let d = 0;
  if (r.mode === "FIXED") d = late.length * r.fixed;
  else if (r.mode === "PCT") d = late.reduce((s, l) => s + classPay(l) * (r.pct / 100), 0);
  else if (r.mode === "MINUTES") d = late.reduce((s, l) => s + (Math.min(l.lateMinutes, l.minutes) / 60) * rate, 0);
  else if (r.mode === "COUNT") { const n = Math.floor(late.length / Math.max(1, r.everyN)); const avg = lines.length ? lines.reduce((s, l) => s + classPay(l), 0) / lines.length : 0; d = n * avg; }
  return Math.round(d * 100) / 100;
}
/** Income tax on the taxable amount: a flat % (filer / non-filer), or the slab whose upper limit the amount falls under. */
export function taxOf(amount: number, t: TaxTable, filer: boolean) {
  if (amount <= 0) return 0;
  let pct = filer ? t.filerPct : t.nonFilerPct;
  if (t.mode === "SLABS" && t.slabs.length) {
    const slabs = t.slabs.slice().sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
    const s = slabs.find((x) => x.upTo === null || amount <= x.upTo) || slabs[slabs.length - 1];
    pct = filer ? s.filerPct : s.nonFilerPct;
  }
  return Math.round(amount * (pct / 100) * 100) / 100;
}
/** The pay sheet: verified hours × rate (+ PhD bonus) − late deductions − tax = net. */
export function paySheet(lines: PayLine[], rate: number, late: LateRule, tax: TaxTable, filer: boolean, phdBonusPct = 0) {
  const minutes = lines.reduce((s, l) => s + l.minutes, 0);
  const hours = Math.round((minutes / 60) * 100) / 100;
  const gross = Math.round(hours * rate * 100) / 100;
  const bonus = Math.round(gross * (phdBonusPct / 100) * 100) / 100;
  const deductions = deductionsOf(lines, rate, late);
  const taxable = Math.max(0, gross + bonus - deductions);
  const tx = taxOf(taxable, tax, filer);
  return { hours, gross, bonus, deductions, tax: tx, net: Math.round((taxable - tx) * 100) / 100, lates: lines.filter((l) => l.late).length };
}
/** The pay period containing `at`: a month, N weeks counted from `anchor`, or the semester (Jan–Jun / Jul–Dec). */
export function periodRange(at: Date, mode: string, weeks = 4, anchor = new Date(Date.UTC(at.getUTCFullYear(), 0, 1))): [Date, Date] {
  if (mode === "SEMESTER") { const h = at.getUTCMonth() < 6 ? 0 : 6; return [new Date(Date.UTC(at.getUTCFullYear(), h, 1)), new Date(Date.UTC(at.getUTCFullYear(), h + 6, 0, 23, 59))]; }
  if (mode === "WEEKS") { const len = Math.max(1, weeks) * 7 * 864e5; const k = Math.floor((at.getTime() - anchor.getTime()) / len); const from = new Date(anchor.getTime() + k * len); return [from, new Date(from.getTime() + len - 60_000)]; }
  return [new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)), new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0, 23, 59))];
}
export const FACULTY_TYPES = ["Permanent", "Shared", "Visiting"] as const;
export const DEFAULT_TAX: TaxTable = { mode: "PCT", filerPct: 10, nonFilerPct: 20, slabs: [] };
