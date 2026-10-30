import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { withErrors } from "../../../../../lib/apiHandler";
import { prisma } from "../../../../../lib/db";
import { icsInvite } from "../../../../../lib/calendarCore";
import { appointmentFor } from "../../../../../lib/teacherCalendar";

/** GET — the .ics invite of an accepted (or cancelled) appointment, for the teacher or the person who asked. */
async function GET_handler(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser().catch(() => null);
  const viewer = user?.mfaVerified ? user.id : (await getAuthenticatedStudent().catch(() => null))?.id;
  if (!viewer) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const a = await appointmentFor(params.id, viewer);
  if (!a || !["ACCEPTED", "CANCELLED"].includes(a.status)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const teacher = await prisma.user.findUnique({ where: { id: a.teacherId }, select: { name: true } });
  const body = icsInvite({ id: a.id, start: new Date(a.startsAt).getTime(), end: new Date(a.endsAt).getTime(), title: `Appointment: ${teacher?.name || "Teacher"} and ${a.requesterName}`, description: `${a.reason}${a.note ? `\n${a.note}` : ""}`, organizer: teacher?.name || "Teacher", attendee: a.requesterName, cancelled: a.status === "CANCELLED" });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="appointment-${a.id.slice(0, 8)}.ics"`, "Cache-Control": "no-store" } });
}
export const GET = withErrors(GET_handler);
