import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const rooms = await prisma.room.findMany({ where: { chairmanId }, orderBy: { name: "asc" } });
  return NextResponse.json({ rooms });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.name || !body.type || !body.capacity) return NextResponse.json({ error: "name, type, and capacity are required" }, { status: 400 });
  if (!["LECTURE", "LAB"].includes(body.type)) return NextResponse.json({ error: "type must be LECTURE or LAB" }, { status: 400 });

  const existing = await prisma.room.findUnique({ where: { chairmanId_name: { chairmanId, name: body.name } } });
  if (existing) return NextResponse.json({ error: `a room named "${body.name}" already exists` }, { status: 409 });

  const room = await prisma.room.create({ data: { chairmanId, name: body.name, type: body.type, capacity: parseInt(body.capacity, 10) } });
  return NextResponse.json({ room }, { status: 201 });
}
