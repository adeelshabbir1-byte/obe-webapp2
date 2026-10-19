import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";

// Meetings planned ahead — alumni, students, faculty, BOS and the rest: date, venue, agenda and who is invited
// (faculty are notified; alumni and student lists are ready to print or email). After the meeting: who came, the
// minutes, and action items with an owner and a due date. The meeting is the same record the evidence / SAR uses.

const mdb = prisma as unknown as Record<string, any>;
export const MEET_HINT = "The meeting planner needs prisma/migration_campus_ops.sql — run it in Supabase.";
export type Invitees = { faculty: "NONE" | "ALL" | "PROGRAM"; alumniProgram: string | null; batchId: string | null; external: string | null };
export type Extra = { meetingId: string; venue: string | null; startTime: string | null; agenda: string | null; inviteesJson: string | null; attendedJson: string | null; status: string };
export type Action = { id: string; meetingId: string; text: string; ownerId: string | null; dueDate: Date | null; status: string; doneAt: Date | null };

export const parseInv = (s: string | null): Invitees => { try { return { faculty: "NONE", alumniProgram: null, batchId: null, external: null, ...JSON.parse(s || "{}") }; } catch { return { faculty: "NONE", alumniProgram: null, batchId: null, external: null }; } };

async function facultyIds(chairmanId: string, leadId: string | null, which: Invitees["faculty"]) {
  if (which === "NONE") return [];
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const where = which === "PROGRAM" && leadId ? { OR: [{ id: leadId }, { managedById: leadId }] } : { OR: [{ managedById: chairmanId }, { managedById: { in: leads.map((l) => l.id).concat("none") } }] };
  return (await prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, ...where }, select: { id: true } })).map((u) => u.id);
}

export async function schedule(chairmanId: string, d: { leadId: string | null; kind: string; title: string; date: Date; startTime: string | null; venue: string | null; agenda: string | null; invitees: Invitees }, by: { id: string; name: string }) {
  const m = await prisma.meetingMinutes.create({ data: { chairmanId, leadId: d.leadId, kind: d.kind, title: d.title, meetingDate: d.date, createdById: by.id } as never });
  await mdb.meetingExtra.create({ data: { id: randomUUID(), meetingId: m.id, venue: d.venue, startTime: d.startTime, agenda: d.agenda, inviteesJson: JSON.stringify(d.invitees), status: "SCHEDULED" } });
  await notifyUsers(await facultyIds(chairmanId, d.leadId, d.invitees.faculty), { kind: "MEETING", title: `Meeting: ${d.title} — ${d.date.toISOString().slice(0, 10)}${d.startTime ? ` ${d.startTime}` : ""}`, body: `${d.venue ? `At ${d.venue}. ` : ""}${d.agenda ? `Agenda: ${d.agenda.slice(0, 300)}` : ""}`, href: "/meeting-planner", exceptId: by.id });
  return m.id;
}

export async function planned(chairmanId: string, leadIds: string[] | null) {
  const extras = (await mdb.meetingExtra.findMany({})) as Extra[];
  const ids = extras.map((e) => e.meetingId);
  const ms = await prisma.meetingMinutes.findMany({ where: { id: { in: ids.concat("none") }, chairmanId, ...(leadIds ? { OR: [{ leadId: { in: leadIds.concat("none") } }, { leadId: null }] } : {}) }, select: { id: true, leadId: true, kind: true, title: true, meetingDate: true, attendees: true, decisions: true, createdById: true }, orderBy: { meetingDate: "desc" }, take: 100 });
  const acts = (await mdb.meetingAction.findMany({ where: { meetingId: { in: ms.map((m) => m.id).concat("none") } }, orderBy: { createdAt: "asc" } })) as Action[];
  const ex = new Map(extras.map((e) => [e.meetingId, e]));
  return ms.map((m) => ({ ...m, extra: ex.get(m.id)!, actions: acts.filter((a) => a.meetingId === m.id) }));
}

/** Who is on the invitation list outside the faculty: alumni of a program, students of a batch. */
export async function inviteList(chairmanId: string, inv: Invitees) {
  const [alumni, students] = await Promise.all([
    inv.alumniProgram ? prisma.alumni.findMany({ where: { chairmanId, degreeProgram: inv.alumniProgram }, select: { name: true, email: true, graduationYear: true }, orderBy: { graduationYear: "desc" }, take: 500 }) : Promise.resolve([]),
    inv.batchId ? prisma.student.findMany({ where: { batchId: inv.batchId, status: "ACTIVE" }, select: { name: true, rollNumber: true }, orderBy: { rollNumber: "asc" } }) : Promise.resolve([]),
  ]);
  return { alumni, students };
}

export async function recordMinutes(meetingId: string, d: { attended: string; minutes: string }) {
  await prisma.meetingMinutes.update({ where: { id: meetingId }, data: { attendees: d.attended || null, decisions: d.minutes || null } as never });
  await mdb.meetingExtra.updateMany({ where: { meetingId }, data: { status: "HELD", attendedJson: JSON.stringify({ count: d.attended.split(/[\n,]/).filter((x) => x.trim()).length }) } });
}
export async function cancelMeeting(meetingId: string) { await mdb.meetingExtra.updateMany({ where: { meetingId }, data: { status: "CANCELLED" } }); }

export async function addAction(meeting: { id: string; title: string }, d: { text: string; ownerId: string | null; dueDate: Date | null }) {
  await mdb.meetingAction.create({ data: { id: randomUUID(), meetingId: meeting.id, ...d, status: "OPEN", createdAt: new Date() } });
  if (d.ownerId) await notifyUsers([d.ownerId], { kind: "MEETING", title: `Action from "${meeting.title}"`, body: `${d.text}${d.dueDate ? ` — due ${d.dueDate.toISOString().slice(0, 10)}` : ""}`, href: "/meeting-planner" });
}
export async function setAction(id: string, done: boolean) { await mdb.meetingAction.update({ where: { id }, data: { status: done ? "DONE" : "OPEN", doneAt: done ? new Date() : null } }); }
export async function myActions(userId: string): Promise<(Action & { meetingTitle: string })[]> {
  try {
    const a = (await mdb.meetingAction.findMany({ where: { ownerId: userId, status: "OPEN" }, orderBy: { dueDate: "asc" } })) as Action[];
    const ms = new Map((await prisma.meetingMinutes.findMany({ where: { id: { in: a.map((x) => x.meetingId).concat("none") } }, select: { id: true, title: true } })).map((m) => [m.id, m.title]));
    return a.map((x) => ({ ...x, meetingTitle: ms.get(x.meetingId) || "" }));
  } catch { return []; }
}
