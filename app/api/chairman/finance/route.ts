import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { logChange } from "../../../../lib/changeLog";
import { financeScope, EXPENSE_CATEGORIES, INCOME_CATEGORIES, recentFiscalYears } from "../../../../lib/resources";

// The Finance Officer or the Institute Head enters the budget, what was spent, and the income for a fiscal year.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const scope = user ? financeScope(user) : null;
  if (!user || !scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const year = String(b.fiscalYear || "");
  if (!/^\d{4}-\d{2}$/.test(year)) return NextResponse.json({ error: "choose a fiscal year such as 2025-26" }, { status: 400 });
  if (!Array.isArray(b.entries)) return NextResponse.json({ error: "no entries" }, { status: 400 });
  const ok = (kind: string, category: string) => (kind === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(category) && ["BUDGET", "SPENT", "INCOME"].includes(kind);
  const rows = (b.entries as { kind: string; category: string; amount: unknown }[]).filter((e) => ok(e.kind, e.category));
  for (const e of rows) {
    const amount = Number(e.amount);
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: `"${e.category}" needs a number of zero or more` }, { status: 400 });
  }
  await prisma.$transaction(rows.map((e) => prisma.financeEntry.upsert({
    where: { chairmanId_fiscalYear_kind_category: { chairmanId: scope.chairmanId, fiscalYear: year, kind: e.kind, category: e.category } },
    create: { chairmanId: scope.chairmanId, fiscalYear: year, kind: e.kind, category: e.category, amount: Number(e.amount) },
    update: { amount: Number(e.amount) },
  })));
  await logChange(scope.chairmanId, "FINANCE", `Finance figures for ${year} saved (${rows.length} lines, total ${rows.reduce((n, e) => n + Number(e.amount), 0).toLocaleString("en-US")})`, user.id);
  return NextResponse.json({ ok: true, years: recentFiscalYears(1) });
}
