import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { logChange } from "../../../../../lib/changeLog";
import { financeScope, EXPENSE_CATEGORIES, INCOME_CATEGORIES, recentFiscalYears } from "../../../../../lib/resources";
import { readWorkbookGrids, findHeader, norm } from "../../../../../lib/excelRead";

export const maxDuration = 60;

const money = (v: string | undefined) => { const t = String(v ?? "").replace(/[^0-9.\-]/g, ""); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

// Reads the sheets "Budget and spending" (Category, Budget, Spent) and "Income" (Category, Amount) for the fiscal year
// chosen on the page. Categories that are not in the file keep their current figures.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const scope = user ? financeScope(user) : null;
  if (!user || !scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const year = String(form?.get("fiscalYear") || "");
  if (!file) return NextResponse.json({ error: "choose a file" }, { status: 400 });
  if (!recentFiscalYears(6).includes(year)) return NextResponse.json({ error: "choose a fiscal year such as 2025-26" }, { status: 400 });
  let sheets;
  try { sheets = await readWorkbookGrids(file); } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }

  const rows: { kind: string; category: string; amount: number }[] = [];
  const warnings: string[] = [];
  const catOf = (list: string[], raw: string) => list.find((c) => norm(c) === norm(raw));
  for (const s of sheets) {
    const exp = findHeader(s.grid, [/^category$/, /^budget/, /^spent/]);
    const inc = !exp ? findHeader(s.grid, [/^category$/, /^amount/]) : null;
    const h = exp || inc;
    if (!h) continue;
    const cc = h.col(/^category$/);
    const bc = exp ? h.col(/^budget/) : -1, sc = exp ? h.col(/^spent/) : -1, ac = inc ? h.col(/^amount/) : -1;
    for (const r of s.grid.slice(h.hi + 1)) {
      const raw = (r[cc] || "").trim();
      if (!raw || /^total/i.test(raw)) continue;
      const cat = catOf(exp ? EXPENSE_CATEGORIES : INCOME_CATEGORIES, raw);
      if (!cat) { warnings.push(`"${raw}" is not a known category, skipped`); continue; }
      for (const [kind, idx] of (exp ? [["BUDGET", bc], ["SPENT", sc]] : [["INCOME", ac]]) as [string, number][]) {
        const n = money(r[idx]);
        if (n === null) continue;
        if (Number.isNaN(n) || n < 0) return NextResponse.json({ error: `"${raw}" needs a number of zero or more` }, { status: 400 });
        rows.push({ kind, category: cat, amount: n });
      }
    }
  }
  if (!rows.length) return NextResponse.json({ error: "no figures found - download the finance file, fill in the Budget, Spent and Amount columns and upload that" }, { status: 400 });

  await prisma.$transaction(rows.map((e) => prisma.financeEntry.upsert({
    where: { chairmanId_fiscalYear_kind_category: { chairmanId: scope.chairmanId, fiscalYear: year, kind: e.kind, category: e.category } },
    create: { chairmanId: scope.chairmanId, fiscalYear: year, kind: e.kind, category: e.category, amount: e.amount },
    update: { amount: e.amount },
  })));
  await logChange(scope.chairmanId, "FINANCE", `Finance figures for ${year} imported from Excel (${rows.length} lines)`, user.id);
  return NextResponse.json({ ok: true, message: `${rows.length} figure(s) saved for ${year}.`, warnings: warnings.slice(0, 6) });
}
