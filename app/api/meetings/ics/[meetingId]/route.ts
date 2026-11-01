import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { getAuthenticatedUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// GET — a meeting as an .ics calendar file (Adeel prompt §24.2), for members.
export async function GET(_req: NextRequest, { params }: { params: { meetingId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const m = await db.cmtMeeting?.findUnique({ where: { id: params.meetingId } }).catch(() => null);
  if (!m) return new NextResponse("Not found", { status: 404 });
  const c = await db.cmtCommittee.findUnique({ where: { id: m.committeeId } });
  const d = new Date(m.date), e = new Date(d.getTime() + 3600e3);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OBEHUB//Meetings//EN", "BEGIN:VEVENT", `UID:${m.id}@obehub`, `DTSTART:${f(d)}`, `DTEND:${f(e)}`, `SUMMARY:${c?.name || "Committee"} meeting`, `LOCATION:${m.venue || ""}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="meeting.ics"` } });
}
