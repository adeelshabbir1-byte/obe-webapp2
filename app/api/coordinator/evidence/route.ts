import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { AREA_OF } from "../../../../lib/evidence";

const num = (v: unknown) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const def = AREA_OF[b.area];
  if (!def || !def.kinds.includes(b.kind) || !String(b.title || "").trim()) return NextResponse.json({ error: "Choose a type and give it a title" }, { status: 400 });
  const date = b.date ? new Date(b.date) : null;
  if (date && isNaN(date.getTime())) return NextResponse.json({ error: "That date is not valid" }, { status: 400 });
  const count = num(b.count);
  const row = await prisma.programEvidence.create({ data: {
    coordinatorId: user.id, area: b.area, kind: b.kind, title: String(b.title).trim().slice(0, 200),
    organization: String(b.organization || "").trim().slice(0, 200) || null, date,
    count: count === null ? null : Math.max(0, Math.round(count)), target: num(b.target), actual: num(b.actual),
    notes: String(b.notes || "").trim().slice(0, 1000) || null,
  } });
  await writeAuditLog({ actorUserId: user.id, action: "EVIDENCE_ADDED", entityType: "ProgramEvidence", entityId: row.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const r = await prisma.programEvidence.deleteMany({ where: { id, coordinatorId: user.id } });
  if (!r.count) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
