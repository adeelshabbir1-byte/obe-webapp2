import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { buildExcelResponse } from "../../../../lib/excelExport";
import { libraryScope } from "../../../../lib/resources";

// The library record as a two-column sheet (Item, Value). The same file can be edited and uploaded back.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await libraryScope(user);
  if (!scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const l = await prisma.libraryInfo.findUnique({ where: { chairmanId: scope.chairmanId } });
  const rows = [
    ["Reading seats", l?.seats ?? 0], ["Book titles (all subjects)", l?.totalTitles ?? 0], ["Computing titles", l?.computingTitles ?? 0],
    ["Total copies (volumes)", l?.totalVolumes ?? 0], ["Printed journals subscribed", l?.printJournals ?? 0], ["E-books available", l?.ebooks ?? 0],
    ["Open hours per week", l?.openHoursPerWeek ?? ""], ["Last stock check (YYYY-MM-DD)", l?.lastStockCheck ? l.lastStockCheck.toISOString().slice(0, 10) : ""],
    ["Qualified librarian in post (Yes/No)", l?.hasLibrarian ? "Yes" : "No"], ["Digital databases subscribed", l?.databases || ""], ["Notes", l?.notes || ""],
  ].map(([item, value]) => ({ item, value }));
  return buildExcelResponse("library-inventory.xlsx", [{ name: "Library", columns: [{ header: "Item", key: "item", width: 40 }, { header: "Value", key: "value", width: 60 }], rows }]);
}
