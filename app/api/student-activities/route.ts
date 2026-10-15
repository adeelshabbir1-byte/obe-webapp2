import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { activitiesScope, canEditSociety, EVENT_CATEGORIES, POSITIONS, SOCIETY_CATEGORIES } from "../../../lib/studentActivities";
import { chairmanIdFor } from "../../../lib/reportScope";
import { notifyUsers } from "../../../lib/notifications";
import { awardEvent, awardLeadership, roomClashes } from "../../../lib/engagement";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown) => { if (v === "" || v === null || v === undefined) return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };

// Societies (Student Affairs / Institute Head), and each society's office bearers and events (also its faculty advisor).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await activitiesScope(user);
  if (!scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = str(b.id, 60) || null;
  try {
    if (b.entity === "society") {
      if (!scope.manageAll) return NextResponse.json({ error: "Only Student Affairs or the Institute Head adds societies." }, { status: 403 });
      const name = str(b.name, 120);
      if (!name) return NextResponse.json({ error: "Name the society." }, { status: 400 });
      let advisorId: string | null = str(b.advisorId, 60) || null;
      if (advisorId) {
        const a = await prisma.user.findUnique({ where: { id: advisorId }, select: { id: true, role: true, managedById: true } });
        if (!a || (await chairmanIdFor(a)) !== scope.chairmanId) advisorId = null;
      }
      const data = { name, category: SOCIETY_CATEGORIES[b.category] ? b.category : "OTHER", advisorId, departmentId: str(b.departmentId, 60) || null, description: str(b.description, 3000) || null, foundedYear: int(b.foundedYear), isActive: b.isActive !== false };
      const row = id ? await prisma.studentSociety.update({ where: { id, chairmanId: scope.chairmanId }, data }) : await prisma.studentSociety.create({ data: { chairmanId: scope.chairmanId, ...data } });
      await writeAuditLog({ actorUserId: user.id, action: id ? "SOCIETY_UPDATED" : "SOCIETY_ADDED", entityType: "StudentSociety", entityId: row.id });
      return NextResponse.json({ society: row });
    }
    const society = await prisma.studentSociety.findFirst({ where: { id: str(b.societyId, 60), chairmanId: scope.chairmanId } });
    if (!society) return NextResponse.json({ error: "society not found" }, { status: 404 });
    if (!canEditSociety(user, scope.manageAll, society)) return NextResponse.json({ error: "Only the society's advisor or Student Affairs can change it." }, { status: 403 });
    // An existing office bearer or event can only be edited through its own society.
    if (id && b.entity === "member" && (await prisma.societyMember.findUnique({ where: { id } }))?.societyId !== society.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (id && b.entity === "event" && (await prisma.societyEvent.findUnique({ where: { id } }))?.societyId !== society.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (b.entity === "member") {
      const rollNumber = str(b.rollNumber, 40) || null;
      // A roll number links the office bearer to the student record (and fills the name).
      const student = rollNumber ? await prisma.student.findFirst({ where: { rollNumber, batch: { coordinator: { managedById: scope.chairmanId } } }, select: { id: true, name: true } }) : null;
      const name = str(b.name, 120) || student?.name || "";
      if (!name) return NextResponse.json({ error: "Enter the student's name or a roll number we know." }, { status: 400 });
      const data = { societyId: society.id, studentId: student?.id || null, name, rollNumber, position: POSITIONS.includes(b.position) ? b.position : str(b.position, 60) || "Member", term: str(b.term, 20) || "—" };
      const row = id ? await prisma.societyMember.update({ where: { id }, data }) : await prisma.societyMember.create({ data });
      return NextResponse.json({ member: row });
    }
    if (b.entity === "event") {
      const title = str(b.title, 160), date = str(b.eventDate, 10);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Give the event a title and a date." }, { status: 400 });
      const data = { societyId: society.id, chairmanId: scope.chairmanId, title, category: EVENT_CATEGORIES.includes(b.category) ? b.category : "Other", eventDate: new Date(date + "T00:00:00.000Z"), venue: str(b.venue, 160) || null, participants: int(b.participants), guests: str(b.guests, 300) || null, description: str(b.description, 3000) || null, outcome: str(b.outcome, 3000) || null, budget: b.budget === "" || b.budget === null || b.budget === undefined ? null : Math.max(0, Number(b.budget) || 0) };
      const row = id ? await prisma.societyEvent.update({ where: { id }, data }) : await prisma.societyEvent.create({ data: { ...data, createdById: user.id } });
      await writeAuditLog({ actorUserId: user.id, action: id ? "SOCIETY_EVENT_UPDATED" : "SOCIETY_EVENT_ADDED", entityType: "SocietyEvent", entityId: row.id });
      return NextResponse.json({ event: row });
    }
    if (b.entity === "decision") {
      // The Student Activities coordinator approves a proposed event with a room, equipment and a budget, or declines it.
      if (!scope.manageAll) return NextResponse.json({ error: "Only Student Affairs or the Institute Head approves events." }, { status: 403 });
      const ev = await prisma.societyEvent.findFirst({ where: { id: str(b.eventId, 60), societyId: society.id } });
      if (!ev) return NextResponse.json({ error: "event not found" }, { status: 404 });
      const approve = b.decision === "APPROVE";
      const note = str(b.note, 500) || null;
      if (!approve && !note) return NextResponse.json({ error: "Say why it is not approved." }, { status: 400 });
      let roomId: string | null = null;
      if (approve && str(b.roomId, 60)) {
        const room = await prisma.room.findFirst({ where: { id: str(b.roomId, 60), chairmanId: scope.chairmanId }, select: { id: true, name: true } });
        if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
        const clash = await roomClashes(scope.chairmanId, room.id, ev.eventDate, ev.startTime, ev.endTime, ev.id);
        if (clash.length) return NextResponse.json({ error: `${room.name} is booked then for "${clash[0].title}". Choose another room.` }, { status: 400 });
        roomId = room.id;
      }
      const budget = approve && b.budget !== "" && b.budget !== null && b.budget !== undefined ? Math.max(0, Number(b.budget) || 0) : approve ? ev.budgetRequested : null;
      const row = await prisma.societyEvent.update({ where: { id: ev.id }, data: { status: approve ? "APPROVED" : "REJECTED", roomId, budget, equipment: approve ? str(b.equipment, 500) || ev.equipment : ev.equipment, decisionNote: note, decidedById: user.id, decidedAt: new Date() } });
      await notifyUsers([society.advisorId], { kind: "SOCIETY", title: `${society.name}: "${ev.title}" ${approve ? "approved" : "not approved"}`, body: note || "", href: `/student-activities?society=${society.id}`, exceptId: user.id });
      await writeAuditLog({ actorUserId: user.id, action: approve ? "SOCIETY_EVENT_APPROVED" : "SOCIETY_EVENT_REJECTED", entityType: "SocietyEvent", entityId: ev.id });
      return NextResponse.json({ event: row });
    }
    if (b.entity === "attendance") {
      const ev = await prisma.societyEvent.findFirst({ where: { id: str(b.eventId, 60), societyId: society.id } });
      if (!ev) return NextResponse.json({ error: "event not found" }, { status: 404 });
      if (!["APPROVED", "COMPLETED"].includes(ev.status)) return NextResponse.json({ error: "Only an approved event can have attendance." }, { status: 400 });
      if (ev.eventDate.getTime() > Date.now() + 86400000) return NextResponse.json({ error: "Take attendance on or after the day of the event." }, { status: 400 });
      const rolls = String(b.rollNumbers || "").split(/[\s,;]+/);
      const r = await awardEvent(ev, rolls, String(b.kind || "ATTENDED"), user.id);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
      await writeAuditLog({ actorUserId: user.id, action: "SOCIETY_ATTENDANCE", entityType: "SocietyEvent", entityId: ev.id, metadata: { added: r.added } });
      return NextResponse.json(r);
    }
    if (b.entity === "leadership") {
      const term = str(b.term, 20);
      if (!term) return NextResponse.json({ error: "Choose the session." }, { status: 400 });
      const r = await awardLeadership(scope.chairmanId, society.id, term, user.id);
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: "A society with that name already exists." }, { status: 400 });
    if (msg.includes("does not exist")) return NextResponse.json({ error: "The student society tables are not up to date — run prisma/migration_oct2026_features.sql and prisma/migration_master_spec.sql in Supabase." }, { status: 500 });
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await activitiesScope(user);
  if (!scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const entity = req.nextUrl.searchParams.get("entity"), id = req.nextUrl.searchParams.get("id") || "";
  if (entity === "society") {
    if (!scope.manageAll) return NextResponse.json({ error: "Only Student Affairs or the Institute Head removes societies." }, { status: 403 });
    const s = await prisma.studentSociety.findFirst({ where: { id, chairmanId: scope.chairmanId } });
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (await prisma.societyEvent.count({ where: { societyId: id } })) return NextResponse.json({ error: "This society has events on record — mark it inactive instead of removing it." }, { status: 400 });
    await prisma.societyMember.deleteMany({ where: { societyId: id } });
    await prisma.studentSociety.delete({ where: { id } });
  } else {
    const row = entity === "member" ? await prisma.societyMember.findUnique({ where: { id } }) : entity === "event" ? await prisma.societyEvent.findUnique({ where: { id } }) : null;
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    const society = await prisma.studentSociety.findFirst({ where: { id: row.societyId, chairmanId: scope.chairmanId } });
    if (!society || !canEditSociety(user, scope.manageAll, society)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (entity === "member") await prisma.societyMember.delete({ where: { id } }); else await prisma.societyEvent.delete({ where: { id } });
  }
  await writeAuditLog({ actorUserId: user.id, action: "SOCIETY_RECORD_REMOVED", entityType: entity || "", entityId: id });
  return NextResponse.json({ ok: true });
}
