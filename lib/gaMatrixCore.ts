// GA matrix of one student (Adeel prompt §20.7): every course of the degree plan × every GA, and per GA a footer of
// courses mapped, attained so far, the requirement, remaining chances, slack and a status. No database here (tested).
export type Cell = { pct: number } | "planned" | "progress" | null;
export type MRow = { code: string; title: string; semester: number | null; status: "PASSED" | "FAILED" | "IN_PROGRESS" | "PLANNED"; ch: number; cells: Record<number, Cell> };
export type Rule = { kind: "avg" } | { kind: "count"; n?: number; pct?: number };
export type GaStatus = "ATTAINED" | "ON_TRACK" | "AT_RISK" | "CANNOT";
export type Footer = { ga: number; mapped: number; taken: number; attained: number; remaining: number; avg: number | null; required: string; slack: string; status: GaStatus };
export const PASS = 50;

export function footers(rows: MRow[], gas: number[], rule: Rule, pass = PASS): Footer[] {
  return gas.map((g) => {
    const taken = rows.filter((r) => typeof r.cells[g] === "object" && r.cells[g] !== null) as (MRow & { cells: Record<number, { pct: number }> })[];
    const left = rows.filter((r) => r.cells[g] === "planned" || r.cells[g] === "progress");
    const mapped = taken.length + left.length;
    const ok = taken.filter((r) => r.cells[g].pct >= pass).length;
    const W = taken.reduce((a, r) => a + r.ch, 0), S = taken.reduce((a, r) => a + r.cells[g].pct * r.ch, 0);
    const R = left.reduce((a, r) => a + r.ch, 0);
    const avg = W ? Math.round((10 * S) / W) / 10 : null;
    if (rule.kind === "count") {
      const need = rule.n ?? Math.ceil(((rule.pct ?? 50) / 100) * Math.max(mapped, 1));
      const slackN = ok + left.length - need;
      const status: GaStatus = ok >= need ? "ATTAINED" : slackN < 0 ? "CANNOT" : slackN === 0 ? "AT_RISK" : "ON_TRACK";
      return { ga: g, mapped, taken: taken.length, attained: ok, remaining: left.length, avg, required: `attained in at least ${need} course${need === 1 ? "" : "s"}`, slack: status === "ATTAINED" ? "—" : slackN < 0 ? "not reachable" : `can still miss ${slackN}`, status };
    }
    if (!R) {
      const status: GaStatus = avg === null ? "AT_RISK" : avg >= pass ? "ATTAINED" : "CANNOT";
      return { ga: g, mapped, taken: taken.length, attained: ok, remaining: 0, avg, required: `average ≥ ${pass}%`, slack: status === "ATTAINED" ? "—" : status === "CANNOT" ? "no courses left" : "not assessed yet", status };
    }
    const needX = Math.ceil((pass * (W + R) - S) / R);
    const status: GaStatus = needX > 100 ? "CANNOT" : avg !== null && avg >= pass && needX <= pass ? "ON_TRACK" : needX <= 0 ? "ON_TRACK" : avg === null ? "ON_TRACK" : "AT_RISK";
    return { ga: g, mapped, taken: taken.length, attained: ok, remaining: left.length, avg, required: `average ≥ ${pass}%`, slack: needX > 100 ? "not reachable" : needX <= 0 ? "already safe" : `needs ≥ ${needX}% average in the ${left.length} remaining`, status };
  });
}
export const STATUS_LABEL: Record<GaStatus, string> = { ATTAINED: "✅ Attained", ON_TRACK: "🟢 On track", AT_RISK: "🟠 At risk", CANNOT: "🔴 Can't attain anymore" };
