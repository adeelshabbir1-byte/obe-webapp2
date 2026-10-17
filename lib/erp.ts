import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

export const edb = prisma as unknown as Record<string, any>;
type U = { id: string; role: string; managedById: string | null };

/** Who may do what in the university ERP modules. */
export async function erpAccess(user: U) {
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  const r = user.role;
  return {
    chairmanId,
    finance: ["CHAIRMAN", "FINANCE_OFFICER"].includes(r),
    hr: ["CHAIRMAN", "FINANCE_OFFICER"].includes(r),
    admissions: ["CHAIRMAN", "STUDENT_AFFAIRS", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "FINANCE_OFFICER"].includes(r),
    inventory: ["CHAIRMAN", "FINANCE_OFFICER", "FACILITIES_MANAGER", "LAB_MANAGER", "LIBRARIAN"].includes(r),
    approvePurchase: ["CHAIRMAN", "FINANCE_OFFICER"].includes(r),
  };
}

// ---- Accounting: a standard university chart of accounts, and posting balanced journal entries.
export const DEFAULT_ACCOUNTS: [string, string, string][] = [
  ["1000", "Cash in hand", "ASSET"], ["1010", "Bank", "ASSET"], ["1100", "Student fee receivable", "ASSET"], ["1200", "Inventory / stores", "ASSET"], ["1500", "Equipment and furniture", "ASSET"],
  ["2000", "Accounts payable (vendors)", "LIABILITY"], ["2100", "Salaries payable", "LIABILITY"], ["2200", "Income tax withheld", "LIABILITY"], ["2300", "Student security deposits", "LIABILITY"],
  ["3000", "University fund", "EQUITY"],
  ["4000", "Tuition fee income", "INCOME"], ["4010", "Admission fee income", "INCOME"], ["4020", "Lab and exam fee income", "INCOME"], ["4030", "Fines and other income", "INCOME"], ["4100", "Grants and donations", "INCOME"],
  ["5000", "Salaries and wages", "EXPENSE"], ["5100", "Scholarships and fee concessions", "EXPENSE"], ["5200", "Supplies and consumables", "EXPENSE"], ["5300", "Utilities", "EXPENSE"], ["5400", "Repairs and maintenance", "EXPENSE"], ["5500", "Events (convocation, open house)", "EXPENSE"],
];
export async function ensureAccounts(chairmanId: string) {
  const n = await edb.ledgerAccount.count({ where: { chairmanId } });
  if (!n) await edb.ledgerAccount.createMany({ data: DEFAULT_ACCOUNTS.map(([code, name, type]) => ({ chairmanId, code, name, type })), skipDuplicates: true });
}
/** Post a journal entry from account codes; debits must equal credits. Never throws — accounting must not block the operation that caused it. */
export async function post(chairmanId: string, userId: string, memo: string, lines: [string, number, number][], source?: string, sourceId?: string, date = new Date()) {
  try {
    await ensureAccounts(chairmanId);
    const dr = lines.reduce((s, l) => s + l[1], 0), cr = lines.reduce((s, l) => s + l[2], 0);
    if (Math.abs(dr - cr) > 0.01 || dr <= 0) return;
    const accts = (await edb.ledgerAccount.findMany({ where: { chairmanId, code: { in: lines.map((l) => l[0]) } } })) as { id: string; code: string }[];
    const e = await edb.journalEntry.create({ data: { chairmanId, date, memo: memo.slice(0, 200), source: source || null, sourceId: sourceId || null, createdById: userId } });
    await edb.journalLine.createMany({ data: lines.filter((l) => l[1] || l[2]).map(([code, d, c]) => ({ entryId: e.id, accountId: accts.find((a) => a.code === code)?.id || "", debit: d, credit: c })).filter((l) => l.accountId) });
  } catch { /* tables missing: skip */ }
}
export const money = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
