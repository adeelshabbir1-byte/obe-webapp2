import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { withErrors } from "../../../../lib/apiHandler";
import { prisma } from "../../../../lib/db";
import { cancelAppointment, requestAppointment, teachersForStudent } from "../../../../lib/teacherCalendar";

/** POST { action: "request", teacherId, startsAt, reason } | { action: "cancel", id } — a student asking one of their teachers for an appointment. */
async function POST_handler(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "cancel") { await cancelAppointment(String(b.id || ""), { id: st.id }); return NextResponse.json({ ok: true }); }
    if (b.action !== "request") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const teacherId = String(b.teacherId || "");
    if (!(await teachersForStudent(st.id)).some((t) => t.id === teacherId)) return NextResponse.json({ error: "You can book your own teachers and your batch advisor." }, { status: 400 });
    const batch = await prisma.batch.findUnique({ where: { id: st.batchId }, select: { coordinator: { select: { managedById: true } } } });
    await requestAppointment(teacherId, { kind: "STUDENT", id: st.id, name: `${st.name} (${st.rollNumber})`, chairmanId: batch?.coordinator?.managedById || null }, String(b.startsAt || ""), String(b.reason || ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
