import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { pakistanHolidays } from "../../../../lib/workdays";
import { withErrors } from "../../../../lib/apiHandler";

// POST { year } loads Pakistan's public holidays into the Academic Calendar (skips ones already there);
// POST { weekend: "6,0" } sets the institute's weekly days off (0 = Sunday … 6 = Saturday). Institute Head only.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets holidays." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.weekend === "string") {
    const w = b.weekend.split(",").map(Number).filter((n: number) => n >= 0 && n <= 6);
    await prisma.academicCalendarEntry.deleteMany({ where: { chairmanId: user.id, kind: "WEEKEND" } });
    await prisma.academicCalendarEntry.create({ data: { chairmanId: user.id, kind: "WEEKEND", title: w.join(","), startDate: new Date(), createdById: user.id } });
    return NextResponse.json({ ok: true });
  }
  const year = Math.round(Number(b.year));
  if (!(year >= 2024 && year <= 2035)) return NextResponse.json({ error: "Choose a year." }, { status: 400 });
  const have = await prisma.academicCalendarEntry.findMany({ where: { chairmanId: user.id, kind: "HOLIDAY", startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } }, select: { title: true } });
  const list = pakistanHolidays(year).filter((h) => !have.some((x) => x.title === h.title));
  await prisma.academicCalendarEntry.createMany({ data: list.map((h) => ({ chairmanId: user.id, kind: "HOLIDAY", title: h.title, startDate: h.start, endDate: new Date(h.start.getTime() + (h.days - 1) * 86400000), createdById: user.id })) });
  return NextResponse.json({ ok: true, added: list.length });
}
export const POST = withErrors(POST_handler);
