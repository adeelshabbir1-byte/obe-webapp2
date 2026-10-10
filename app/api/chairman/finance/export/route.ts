import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";
import { financeScope, EXPENSE_CATEGORIES, INCOME_CATEGORIES, fiscalYearNow, recentFiscalYears } from "../../../../../lib/resources";

// One fiscal year as two sheets (Budget and spending, Income) that can be edited and uploaded back,
// plus a read-only "Year by year" summary of the last six years.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const scope = user ? financeScope(user) : null;
  if (!user || !scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const years = recentFiscalYears(6);
  const q = new URL(req.url).searchParams.get("year") || "";
  const year = years.includes(q) ? q : fiscalYearNow();
  const entries = await prisma.financeEntry.findMany({ where: { chairmanId: scope.chairmanId, fiscalYear: { in: years } } });
  const get = (y: string, kind: string, cat: string) => entries.find((e) => e.fiscalYear === y && e.kind === kind && e.category === cat)?.amount ?? 0;
  const sum = (y: string, kind: string, cats: string[]) => cats.reduce((n, c) => n + get(y, kind, c), 0);
  return buildExcelResponse(`finance-${year}.xlsx`, [
    { name: "Budget and spending", columns: [{ header: "Category", key: "c", width: 42 }, { header: `Budget (PKR) ${year}`, key: "b", width: 22 }, { header: `Spent (PKR) ${year}`, key: "s", width: 22 }],
      rows: EXPENSE_CATEGORIES.map((c) => ({ c, b: get(year, "BUDGET", c), s: get(year, "SPENT", c) })) },
    { name: "Income", columns: [{ header: "Category", key: "c", width: 42 }, { header: `Amount (PKR) ${year}`, key: "a", width: 22 }],
      rows: INCOME_CATEGORIES.map((c) => ({ c, a: get(year, "INCOME", c) })) },
    { name: "Year by year", columns: [{ header: "Year", key: "y", width: 12 }, { header: "Budget", key: "b", width: 16 }, { header: "Spent", key: "s", width: 16 }, { header: "Lab equipment budget", key: "l", width: 22 }, { header: "Library budget", key: "lb", width: 18 }, { header: "Income", key: "i", width: 16 }],
      rows: years.map((y) => ({ y, b: sum(y, "BUDGET", EXPENSE_CATEGORIES), s: sum(y, "SPENT", EXPENSE_CATEGORIES), l: get(y, "BUDGET", "Laboratory equipment and upgrades"), lb: get(y, "BUDGET", "Library and digital resources"), i: sum(y, "INCOME", INCOME_CATEGORIES) })) },
  ]);
}
