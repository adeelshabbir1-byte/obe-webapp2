import { randomUUID } from "crypto";
import { prisma } from "./db";
import { addMember, committee, committeesFor, membersOf, saveCommittee, canManage } from "./committeeEngine";
import { notifyUsers } from "./notifications";
import { getTimetableEntries } from "./timetableView";
import { freeSlots } from "./timetableCore";
import { writeAuditLog } from "./audit";
import { getFlag, setFlag } from "./scopedSettings";

// One Meetings system on the committee engine (Adeel prompt §24): every committee and meeting in one place, old
// Committees moved into the engine (originals kept until checked), times suggested when members are free, .ics
// invitations and reminders, action items in the owner's "What's next" and in the next meeting's agenda.
const db = prisma as unknown as Record<string, any>;
type U = { id: string; role: string; name: string };

export async function overview(chairmanId: string, user: U) {
  const cs = await committeesFor(chairmanId, user as never);
  const meetings = ((await db.cmtMeeting?.findMany({ where: { committeeId: { in: cs.map((c) => c.id).concat("none") } }, orderBy: { date: "desc" }, take: 60 }).catch(() => [])) || []) as { id: string; committeeId: string; date: Date; venue: string | null; status: string }[];
  const open = ((await db.cmtItem?.groupBy({ by: ["committeeId"], where: { committeeId: { in: cs.map((c) => c.id).concat("none") }, status: "OPEN" }, _count: { _all: true } }).catch(() => [])) || []) as { committeeId: string; _count: { _all: number } }[];
  const actions = ((await db.cmtAction?.findMany({ where: { committeeId: { in: cs.map((c) => c.id).concat("none") } }, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => [])) || []) as { id: string; committeeId: string; title: string; ownerId: string | null; due: Date | null; status: string }[];
  const legacyRows = await prisma.committee.findMany({ where: { chairmanId }, select: { id: true, name: true, kind: true } }).catch(() => []);
  const [lm, lmt] = await Promise.all([
    prisma.committeeMember.groupBy({ by: ["committeeId"], where: { committeeId: { in: legacyRows.map((l) => l.id).concat("none") } }, _count: { _all: true } }).catch(() => []),
    prisma.committeeMeeting.groupBy({ by: ["committeeId"], where: { committeeId: { in: legacyRows.map((l) => l.id).concat("none") } }, _count: { _all: true } }).catch(() => []),
  ]);
  const legacy = legacyRows.map((l) => ({ ...l, _count: { members: lm.find((x) => x.committeeId === l.id)?._count._all || 0, meetings: lmt.find((x) => x.committeeId === l.id)?._count._all || 0 } }));
  const imported = new Set(JSON.parse((await getFlag(chairmanId, "meetings:imported").catch(() => null)) || "[]") as string[]);
  return { committees: cs.map((c) => ({ ...c, open: open.find((o) => o.committeeId === c.id)?._count._all || 0, manage: canManage(user as never, c) })), meetings, actions, legacy: (legacy as { id: string; name: string; kind: string; _count: { meetings: number; members: number } }[]).map((l) => ({ ...l, imported: imported.has(l.id) })) };
}

/** Move the older Committees (with members) into the engine. The originals stay until the result is checked. */
export async function importLegacy(chairmanId: string, user: U) {
  if (user.role !== "CHAIRMAN") throw new Error("The Institute Head moves the old committees.");
  const done = new Set(JSON.parse((await getFlag(chairmanId, "meetings:imported").catch(() => null)) || "[]") as string[]);
  const old = (await prisma.committee.findMany({ where: { chairmanId } })).map((c) => ({ ...c, members: [] as { userId: string | null; name: string | null; organisation: string | null }[] }));
  const allMembers = await prisma.committeeMember.findMany({ where: { committeeId: { in: old.map((c) => c.id).concat("none") } } });
  for (const c of old) c.members = allMembers.filter((m) => m.committeeId === c.id) as never;
  let n = 0;
  for (const c of old) {
    if (done.has(c.id)) continue;
    const id = (await saveCommittee(user as never, chairmanId, { type: "HEC_MANDATED", scope: "INSTITUTE", name: c.name, mode: "FULL", quorumPct: 50, majorityPct: 50 } as never)) as unknown as string;
    if (id) for (const m of c.members) await addMember(user as never, id, { userId: m.userId || null, name: m.name || undefined, organisation: m.organisation || undefined } as never).catch(() => null);
    done.add(c.id); n++;
  }
  await setFlag(chairmanId, "meetings:imported", JSON.stringify(Array.from(done)));
  await writeAuditLog({ actorUserId: user.id, action: "COMMITTEES_IMPORTED", metadata: { count: n } }).catch(() => null);
  return n;
}

/** Times this week when every member who teaches is free (timetable) and a room is free, longest first. */
export async function suggestTimes(chairmanId: string, committeeId: string) {
  const ms = await membersOf(committeeId);
  const teachers = ms.map((m) => m.userId).filter((x): x is string => !!x);
  const [entries, rooms] = await Promise.all([getTimetableEntries(chairmanId), prisma.room.findMany({ where: { chairmanId }, select: { id: true, name: true, type: true, capacity: true } })]);
  return freeSlots(entries, rooms, { teachers, minHours: 1, size: ms.length }).slice(0, 8);
}

/** Tell members about a meeting, with the calendar file link. */
export async function invite(meetingId: string) {
  const mt = await db.cmtMeeting.findUnique({ where: { id: meetingId } });
  if (!mt) return 0;
  const c = await committee(mt.committeeId);
  const ms = await membersOf(mt.committeeId);
  const ids = ms.map((m) => m.userId).filter((x): x is string => !!x);
  await notifyUsers(ids, { kind: "MEETING", title: `${c?.name}: meeting on ${new Date(mt.date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, body: `${mt.venue || ""} — add to your calendar: /api/meetings/ics/${meetingId}`, href: "/meetings-hub" });
  return ids.length;
}
/** Reminders one day before (from the daily cron). */
export async function remindMeetings(now = new Date()) {
  const from = new Date(now.getTime() + 12 * 3600e3), to = new Date(now.getTime() + 36 * 3600e3);
  const list = ((await db.cmtMeeting?.findMany({ where: { date: { gte: from, lte: to } } }).catch(() => [])) || []) as { id: string }[];
  for (const m of list) await invite(m.id).catch(() => null);
  return list.length;
}

export async function addAction(user: U, committeeId: string, a: { title: string; ownerId?: string; due?: string; meetingId?: string }) {
  const c = await committee(committeeId);
  if (!c || !canManage(user as never, c)) throw new Error("Only the Convener records action items.");
  if (!a.title?.trim()) throw new Error("What is the action?");
  const id = randomUUID();
  await db.cmtAction.create({ data: { id, committeeId, meetingId: a.meetingId || null, title: a.title.trim().slice(0, 300), ownerId: a.ownerId || null, due: a.due ? new Date(a.due) : null, createdById: user.id } });
  if (a.ownerId) await notifyUsers([a.ownerId], { kind: "MEETING", title: `Action for you (${c.name}): ${a.title}`, body: a.due ? `Due ${a.due}` : "", href: "/meetings-hub" });
  return id;
}
export async function closeAction(user: U, id: string) {
  const a = await db.cmtAction.findUnique({ where: { id } });
  if (!a) throw new Error("Not found.");
  const c = await committee(a.committeeId);
  if (a.ownerId !== user.id && !(c && canManage(user as never, c))) throw new Error("Only the owner or the Convener closes it.");
  await db.cmtAction.update({ where: { id }, data: { status: "DONE", doneAt: new Date() } });
}
