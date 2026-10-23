import type { Who } from "./registers";

// Faculty development funding. A study leave or scholarship carries a bond: the teacher serves the institute for the
// bond years after returning; leaving earlier means refunding the unserved share. Conference and training grants
// have no bond. Spending is totalled by Pakistan's fiscal year (1 July – 30 June) for the councils' tables.

export const FDP_HINT = "Faculty development funding needs prisma/migration_fdp_funding.sql — run it in Supabase.";
export const KINDS: Record<string, string> = { STUDY_LEAVE: "Study leave (higher studies)", SCHOLARSHIP: "Scholarship", CONFERENCE: "Conference grant", TRAINING: "Training / workshop grant" };
export const SPONSORS: Record<string, string> = { INSTITUTE: "The institute", HEC: "HEC", OTHER: "Other sponsor" };
export const STATUS: Record<string, string> = { ACTIVE: "On leave / studying", RETURNED: "Returned — serving the bond", COMPLETED: "Completed (bond served)", DISCONTINUED: "Discontinued", BOND_BROKEN: "Bond broken — refund due" };
export type Funding = { id: string; chairmanId: string; userId: string; kind: string; sponsor: string; sponsorName: string | null; purpose: string; place: string | null; country: string | null; feeAmount: number; stipendAmount: number; travelAmount: number; otherAmount: number; sanctionedAt: Date | null; startDate: Date | null; expectedReturn: Date | null; actualReturn: Date | null; bondYears: number; status: string; refundDue: number | null; refundPaid: number | null; notes: string | null };
export const canManageFdp = (w: Who) => w.head || w.dean || w.hod || w.finance;
export const total = (f: Pick<Funding, "feeAmount" | "stipendAmount" | "travelAmount" | "otherAmount">) => f.feeAmount + f.stipendAmount + f.travelAmount + f.otherAmount;
export const hasBond = (f: Pick<Funding, "kind" | "bondYears">) => ["STUDY_LEAVE", "SCHOLARSHIP"].includes(f.kind) && f.bondYears > 0;

/** When the bond is served, and — if the teacher leaves on a given date — the refund for the unserved share (pro rata). */
export function bond(f: Funding, leaving?: Date | null) {
  if (!hasBond(f) || !f.actualReturn) return { until: null as Date | null, servedPct: null as number | null, refund: null as number | null };
  const start = new Date(f.actualReturn).getTime(), end = start + f.bondYears * 365.25 * 864e5;
  const at = (leaving || new Date()).getTime();
  const servedPct = Math.max(0, Math.min(100, Math.round(((at - start) / (end - start)) * 100)));
  return { until: new Date(end), servedPct, refund: leaving ? Math.round(total(f) * (100 - servedPct) / 100) : null };
}
/** Pakistan's fiscal year of a date, written 2025-26. */
export function fiscalYear(d: Date) { const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
export function spending(rows: Funding[]) {
  const by = new Map<string, Record<string, number>>();
  for (const f of rows) {
    const d = f.sanctionedAt || f.startDate; if (!d) continue;
    const k = fiscalYear(new Date(d)); const r = by.get(k) || {};
    r[f.kind] = (r[f.kind] || 0) + total(f); r[`sp_${f.sponsor}`] = (r[`sp_${f.sponsor}`] || 0) + total(f); r.all = (r.all || 0) + total(f);
    by.set(k, r);
  }
  return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}
