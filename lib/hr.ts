import { prisma } from "./db";
import { edb } from "./erp";

export type PayLine = { name: string; amount: number };
/** "House rent: 15000, Medical: 5000" → lines. */
export const parseLines = (t: string): PayLine[] => String(t || "").split(/[,\n]/).map((x) => x.split(":")).filter((p) => p.length === 2 && p[0].trim() && Number(p[1]) > 0).map(([n, a]) => ({ name: n.trim().slice(0, 40), amount: Math.round(Number(a)) }));
export const linesText = (j: string) => { try { return (JSON.parse(j) as PayLine[]).map((l) => `${l.name}: ${l.amount}`).join(", "); } catch { return ""; } };

/** Staff of the institute (everyone who is not a student), with their HR profile. */
export async function staffOf(chairmanId: string) {
  const users = await prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, name: true, email: true, role: true, departmentId: true }, orderBy: { name: "asc" } });
  const [profiles, pays, depts] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { userId: true, designation: true, employmentType: true, dateOfJoining: true } }),
    edb.payStructure.findMany({ where: { userId: { in: users.map((u) => u.id) } } }).catch(() => []) as Promise<{ userId: string; basic: number; allowancesJson: string; deductionsJson: string; taxPct: number; bank: string | null; account: string | null }[]>,
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true } }),
  ]);
  return users.map((u) => ({ ...u, profile: profiles.find((p) => p.userId === u.id) || null, pay: pays.find((p) => p.userId === u.id) || null, department: depts.find((d) => d.id === u.departmentId)?.name || null }));
}

/** One employee's payslip from their pay structure. Tax is a flat % of taxable gross (set per employee). */
export function computeSlip(pay: { basic: number; allowancesJson: string; deductionsJson: string; taxPct: number }) {
  const allow = (() => { try { return JSON.parse(pay.allowancesJson) as PayLine[]; } catch { return []; } })();
  const ded = (() => { try { return JSON.parse(pay.deductionsJson) as PayLine[]; } catch { return []; } })();
  const gross = pay.basic + allow.reduce((s, l) => s + l.amount, 0);
  const tax = Math.round((gross * (pay.taxPct || 0)) / 100);
  const deductions = ded.reduce((s, l) => s + l.amount, 0);
  return { gross, tax, deductions, net: gross - tax - deductions, lines: { basic: pay.basic, allowances: allow, deductions: ded, taxPct: pay.taxPct } };
}
