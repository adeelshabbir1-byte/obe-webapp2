import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { facilitiesScope, OWNERSHIP, ROOM_TYPES, SERVICE_KINDS } from "../../../lib/facilities";
import { withErrors } from "../../../lib/apiHandler";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => { if (v === "" || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const int = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n); };

async function scope() {
  const user = await getAuthenticatedUser();
  if (!user) return { error: NextResponse.json({ error: "not logged in" }, { status: 401 }) };
  const s = await facilitiesScope(user);
  if (!s || !s.canEdit) return { error: NextResponse.json({ error: "Only the Facilities Manager or the Institute Head can change facilities." }, { status: 403 }) };
  return { user, chairmanId: s.chairmanId };
}

// Add or update a building, a room or a service; or copy the timetable's rooms into a building.
async function POST_handler(req: NextRequest) {
  const s = await scope();
  if ("error" in s) return s.error;
  const { user, chairmanId } = s;
  const b = await req.json().catch(() => ({}));
  const id = str(b.id, 60) || null;
  try {
    if (b.entity === "building") {
      const name = str(b.name, 120);
      if (!name) return NextResponse.json({ error: "Name the building." }, { status: 400 });
      const data = { name, campus: str(b.campus, 120) || null, totalAreaSqft: num(b.totalAreaSqft), coveredAreaSqft: num(b.coveredAreaSqft), floors: int(b.floors), yearBuilt: int(b.yearBuilt), ownership: OWNERSHIP[b.ownership] ? b.ownership : null, notes: str(b.notes, 3000) || null, updatedById: user.id };
      if (data.totalAreaSqft !== null && data.coveredAreaSqft !== null && data.coveredAreaSqft > data.totalAreaSqft * (data.floors || 1)) return NextResponse.json({ error: "Covered area is larger than the land area times the floors — check the figures." }, { status: 400 });
      const row = id ? await prisma.facilityBuilding.update({ where: { id, chairmanId }, data }) : await prisma.facilityBuilding.create({ data: { chairmanId, ...data } });
      await writeAuditLog({ actorUserId: user.id, action: id ? "FACILITY_BUILDING_UPDATED" : "FACILITY_BUILDING_ADDED", entityType: "FacilityBuilding", entityId: row.id });
      return NextResponse.json({ building: row });
    }
    if (b.entity === "room") {
      const name = str(b.name, 120), buildingId = str(b.buildingId, 60);
      if (!name || !buildingId) return NextResponse.json({ error: "Choose the building and name the room." }, { status: 400 });
      if (!(await prisma.facilityBuilding.findFirst({ where: { id: buildingId, chairmanId } }))) return NextResponse.json({ error: "building not found" }, { status: 404 });
      const data = { buildingId, name, roomType: ROOM_TYPES[b.roomType] ? b.roomType : "OTHER", floor: str(b.floor, 30) || null, lengthFt: num(b.lengthFt), widthFt: num(b.widthFt), capacity: int(b.capacity), multimedia: !!b.multimedia, airConditioned: !!b.airConditioned, notes: str(b.notes, 500) || null };
      const row = id ? await prisma.facilityRoom.update({ where: { id, chairmanId }, data }) : await prisma.facilityRoom.create({ data: { chairmanId, ...data } });
      return NextResponse.json({ room: row });
    }
    if (b.entity === "service") {
      const kind = SERVICE_KINDS[b.kind] ? b.kind : "OTHER";
      const name = str(b.name, 120) || SERVICE_KINDS[kind].label;
      const data = { kind, name, available: b.available !== false, quantity: int(b.quantity), capacity: int(b.capacity), staff: int(b.staff), details: str(b.details, 3000) || null, updatedById: user.id };
      const row = id ? await prisma.facilityService.update({ where: { id, chairmanId }, data }) : await prisma.facilityService.create({ data: { chairmanId, ...data } });
      await writeAuditLog({ actorUserId: user.id, action: id ? "FACILITY_SERVICE_UPDATED" : "FACILITY_SERVICE_ADDED", entityType: "FacilityService", entityId: row.id });
      return NextResponse.json({ service: row });
    }
    if (b.entity === "import-timetable-rooms") {
      // The timetable already knows the rooms (name, type, capacity): copy the ones not yet listed into a building.
      const buildingId = str(b.buildingId, 60);
      if (!(await prisma.facilityBuilding.findFirst({ where: { id: buildingId, chairmanId } }))) return NextResponse.json({ error: "Choose a building first." }, { status: 400 });
      const [tt, have] = await Promise.all([prisma.room.findMany({ where: { chairmanId } }), prisma.facilityRoom.findMany({ where: { chairmanId }, select: { name: true } })]);
      const known = new Set(have.map((r) => r.name.toLowerCase()));
      const fresh = tt.filter((r) => !known.has(r.name.toLowerCase()));
      if (fresh.length) await prisma.facilityRoom.createMany({ data: fresh.map((r) => ({ chairmanId, buildingId, name: r.name, roomType: r.type === "LAB" ? "LAB" : "CLASSROOM", capacity: r.capacity, departmentId: r.departmentId })), skipDuplicates: true });
      return NextResponse.json({ imported: fresh.length });
    }
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: "There is already one with that name." }, { status: 400 });
    if (msg.includes("does not exist")) return NextResponse.json({ error: "The facilities tables are not in the database yet — run prisma/migration_oct2026_features.sql in Supabase." }, { status: 500 });
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

async function DELETE_handler(req: NextRequest) {
  const s = await scope();
  if ("error" in s) return s.error;
  const entity = req.nextUrl.searchParams.get("entity"), id = req.nextUrl.searchParams.get("id") || "";
  if (entity === "building") {
    if (await prisma.facilityRoom.count({ where: { buildingId: id, chairmanId: s.chairmanId } })) return NextResponse.json({ error: "Remove or move the building's rooms first." }, { status: 400 });
    await prisma.facilityBuilding.deleteMany({ where: { id, chairmanId: s.chairmanId } });
  } else if (entity === "room") await prisma.facilityRoom.deleteMany({ where: { id, chairmanId: s.chairmanId } });
  else if (entity === "service") await prisma.facilityService.deleteMany({ where: { id, chairmanId: s.chairmanId } });
  else return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  await writeAuditLog({ actorUserId: s.user.id, action: "FACILITY_REMOVED", entityType: entity, entityId: id });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
export const DELETE = withErrors(DELETE_handler);
