import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { holdersOf, notifyUsers } from "../../../../lib/notifications";
import { EVENT_CATEGORIES } from "../../../../lib/studentActivities";
import { officesOf, validTime } from "../../../../lib/engagement";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// A society's office bearers propose events (workshops, competitions, talks) for the Student Activities coordinator to
// approve, and can withdraw a proposal that is still waiting.
async function POST_handler(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return bad("not logged in", 401);
  const b = await req.json().catch(() => ({}));
  try {
    const offices = await officesOf(student.id);
    if (b.action === "cancel") {
      const ev = await prisma.societyEvent.findFirst({ where: { id: str(b.eventId, 60), proposedByStudentId: student.id, status: "PROPOSED" } });
      if (!ev) return bad("Only a proposal still waiting for approval can be withdrawn.", 404);
      await prisma.societyEvent.update({ where: { id: ev.id }, data: { status: "CANCELLED" } });
      return NextResponse.json({ ok: true });
    }
    if (b.action !== "propose") return bad("unknown action");
    const society = await prisma.studentSociety.findUnique({ where: { id: str(b.societyId, 60) } });
    if (!society || !society.isActive || !offices.some((o) => o.societyId === society.id)) return bad("Only an office bearer of the society proposes its events.", 403);
    const title = str(b.title, 160), date = str(b.eventDate, 10);
    if (title.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("Give the event a title and a date.");
    const eventDate = new Date(date + "T00:00:00.000Z");
    if (eventDate.getTime() < Date.now() - 86400000) return bad("The date has passed.");
    const startTime = validTime(b.startTime) ? String(b.startTime) : null, endTime = validTime(b.endTime) ? String(b.endTime) : null;
    if (startTime && endTime && endTime <= startTime) return bad("The event must end after it starts.");
    const description = str(b.description, 3000);
    if (description.length < 20) return bad("Describe the event: what happens, who it is for, and why.");
    const budgetRequested = b.budgetRequested === "" || b.budgetRequested === undefined || b.budgetRequested === null ? null : Math.max(0, Number(b.budgetRequested) || 0);
    const participants = Number.isFinite(Number(b.participants)) && Number(b.participants) > 0 ? Math.round(Number(b.participants)) : null;
    const ev = await prisma.societyEvent.create({
      data: {
        societyId: society.id, chairmanId: society.chairmanId, title, category: EVENT_CATEGORIES.includes(b.category) ? b.category : "Other", eventDate, startTime, endTime,
        venue: str(b.venue, 160) || null, equipment: str(b.equipment, 500) || null, budgetRequested, participants, guests: str(b.guests, 300) || null, description,
        status: "PROPOSED", proposedByStudentId: student.id, createdById: `student:${student.id}`,
      },
    });
    await notifyUsers([society.advisorId, ...(await holdersOf(society.chairmanId, "STUDENT_AFFAIRS"))], {
      kind: "SOCIETY", title: `Event proposal from ${society.name}: ${title}`,
      body: `${date}${startTime ? ` ${startTime}${endTime ? `–${endTime}` : ""}` : ""}${budgetRequested ? ` · budget PKR ${Math.round(budgetRequested).toLocaleString("en-US")}` : ""}. Proposed by ${student.name}.`,
      href: `/student-activities?society=${society.id}`,
    });
    await writeAuditLog({ action: "SOCIETY_EVENT_PROPOSED", entityType: "SocietyEvent", entityId: ev.id, metadata: { studentId: student.id } });
    return NextResponse.json({ event: ev });
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("Society events are not available yet. Please try again later.", 500);
    return bad("Could not save.", 500);
  }
}
export const POST = withErrors(POST_handler);
