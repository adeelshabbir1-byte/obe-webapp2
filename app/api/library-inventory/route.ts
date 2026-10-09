import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { labScope } from "../../../lib/resources";

const int = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const str = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// Saves the institute's library record (the Lab Manager or the Institute Head).
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "only the Lab Manager or the Institute Head can change the library record" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const total = int(b.totalTitles), computing = Math.min(int(b.computingTitles), total);
  const last = typeof b.lastStockCheck === "string" && b.lastStockCheck ? new Date(b.lastStockCheck) : null;
  const data = {
    seats: int(b.seats), totalTitles: total, computingTitles: computing, totalVolumes: int(b.totalVolumes), printJournals: int(b.printJournals), ebooks: int(b.ebooks),
    databases: str(b.databases), openHoursPerWeek: b.openHoursPerWeek === "" || b.openHoursPerWeek == null ? null : int(b.openHoursPerWeek),
    hasLibrarian: b.hasLibrarian === true || b.hasLibrarian === "on", lastStockCheck: last && !isNaN(last.getTime()) ? last : null, notes: str(b.notes), updatedById: user.id,
  };
  await prisma.libraryInfo.upsert({ where: { chairmanId: scope.chairmanId }, create: { chairmanId: scope.chairmanId, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
