/** Purchase lines are typed one per line: "name | qty | unit cost | stock code (optional)". */
export type PLine = { name: string; qty: number; unitCost: number; code?: string };
export function parsePLines(text: string): PLine[] {
  return String(text || "").split(/\r?\n/).map((r) => r.split("|").map((x) => x.trim())).filter((p) => p[0])
    .map(([name, qty, cost, code]) => ({ name: name.slice(0, 120), qty: Math.max(0, Number(qty) || 1), unitCost: Math.max(0, Number(cost) || 0), ...(code ? { code: code.slice(0, 40) } : {}) }));
}
export const pTotal = (l: PLine[]) => l.reduce((s, x) => s + x.qty * x.unitCost, 0);
export const P_STATUS: Record<string, string> = { REQUESTED: "Awaiting approval", APPROVED: "Approved — to order", REJECTED: "Rejected", ORDERED: "Ordered", RECEIVED: "Received — to pay", PAID: "Paid" };
