import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { nextDays } from "../../../../../lib/timetableLive";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// A personal calendar feed (.ics) for Google / Outlook / phones: the next 28 days of the person's classes, with
// reschedules and cancellations (Adeel prompt §23.6). The link is private and revocable.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const t = await db.timetableToken?.findUnique({ where: { token: params.token } }).catch(() => null);
  if (!t || t.revokedAt || t.kind !== "ICS") return new NextResponse("Not found", { status: 404 });
  const days = await nextDays(t.chairmanId, 28);
  const z = (n: number) => String(n).padStart(2, "0");
  const stamp = (date: string, h: number) => `${date.replace(/-/g, "")}T${z(Math.floor(h))}${z(Math.round((h % 1) * 60))}00`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OBEHUB//Timetable//EN", "X-WR-CALNAME:OBEHUB classes"];
  for (const d of days) for (const c of d.classes.filter((x) => x.instructorId === t.userId || x.note?.includes(String(t.userId)))) {
    lines.push("BEGIN:VEVENT", `UID:${c.id}-${d.date}@obehub`, `DTSTART:${stamp(d.date, c.startHour)}`, `DTEND:${stamp(d.date, c.endHour)}`, `SUMMARY:${c.status === "CANCELLED" ? "CANCELLED: " : ""}${c.courseCode} ${c.batchLabels.join(", ")}`.slice(0, 200), `LOCATION:${c.roomName}`, ...(c.note ? [`DESCRIPTION:${c.note.replace(/\n/g, " ")}`] : []), ...(c.status === "CANCELLED" ? ["STATUS:CANCELLED"] : []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}
