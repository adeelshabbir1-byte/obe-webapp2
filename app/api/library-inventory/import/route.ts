import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { logChange } from "../../../../lib/changeLog";
import { libraryScope } from "../../../../lib/resources";
import { readWorkbookGrids, findHeader, norm, toInt, toText, toDate } from "../../../../lib/excelRead";

export const maxDuration = 60;

// Reads the library sheet (Item / Value rows, as the download gives it). Items missing from the file keep their current value.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await libraryScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "only the Librarian, the Lab Manager or the Institute Head can change the library record" }, { status: 403 });
  const file = (await req.formData().catch(() => null))?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file" }, { status: 400 });
  let sheets;
  try { sheets = await readWorkbookGrids(file); } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }

  let found: { grid: string[][]; hi: number; item: number; value: number } | null = null;
  for (const s of sheets) {
    const h = findHeader(s.grid, [/^item$/, /^value$/]);
    if (h) { found = { grid: s.grid, hi: h.hi, item: h.col(/^item$/), value: h.col(/^value$/) }; break; }
  }
  if (!found) return NextResponse.json({ error: "no sheet with the headings Item and Value found - download the library file and edit that" }, { status: 400 });

  const vals = new Map<string, string>();
  for (const r of found.grid.slice(found.hi + 1)) { const k = norm(r[found.item]); if (k) vals.set(k, (r[found.value] || "").trim()); }
  const get = (re: RegExp) => { for (const [k, v] of Array.from(vals.entries())) if (re.test(k)) return { v }; return null; };

  const cur = await prisma.libraryInfo.findUnique({ where: { chairmanId: scope.chairmanId } });
  const intOf = (re: RegExp, fallback: number) => { const g = get(re); return g ? toInt(g.v) ?? fallback : fallback; };
  const totalTitles = intOf(/^book titles/, cur?.totalTitles ?? 0);
  const g = { oh: get(/^open hours/), sc: get(/^last stock check/), lib: get(/^qualified librarian/), db: get(/^digital databases/), nt: get(/^notes$/) };
  const data = {
    seats: intOf(/^reading seats/, cur?.seats ?? 0), totalTitles, computingTitles: Math.min(intOf(/^computing titles/, cur?.computingTitles ?? 0), totalTitles),
    totalVolumes: intOf(/^total copies/, cur?.totalVolumes ?? 0), printJournals: intOf(/^printed journals/, cur?.printJournals ?? 0), ebooks: intOf(/^e books/, cur?.ebooks ?? 0),
    openHoursPerWeek: g.oh ? toInt(g.oh.v) : cur?.openHoursPerWeek ?? null,
    lastStockCheck: g.sc ? toDate(g.sc.v) : cur?.lastStockCheck ?? null,
    hasLibrarian: g.lib ? /^(y|yes|true|1)/i.test(g.lib.v) : cur?.hasLibrarian ?? false,
    databases: g.db ? toText(g.db.v) : cur?.databases ?? null, notes: g.nt ? toText(g.nt.v) : cur?.notes ?? null, updatedById: user.id,
  };
  await prisma.libraryInfo.upsert({ where: { chairmanId: scope.chairmanId }, create: { chairmanId: scope.chairmanId, ...data }, update: data });
  await logChange(scope.chairmanId, "LIBRARY", `Library record imported from Excel: ${data.totalTitles} titles, ${data.totalVolumes} volumes, ${data.seats} seats`, user.id);
  return NextResponse.json({ ok: true, message: `Library record updated (${vals.size} line${vals.size === 1 ? "" : "s"} read).` });
}
