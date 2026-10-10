import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { ALLOWED_TYPES, MAX_FILE_BYTES, MEETING_KINDS, MEETING_ROLES, fileScope } from "../../../lib/evidenceFiles";

const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !MEETING_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const scope = await fileScope(user);
  const date = new Date(b.meetingDate);
  if (!MEETING_KINDS[b.kind] || !txt(b.title, 200) || isNaN(date.getTime())) return NextResponse.json({ error: "Choose the kind of meeting, a title and the date" }, { status: 400 });
  const leadId = b.leadId ? String(b.leadId) : null;
  if (leadId && !scope.leadIds.includes(leadId)) return NextResponse.json({ error: "That program is not in your area" }, { status: 403 });
  let file: { fileName: string; mimeType: string; data: string } | null = null;
  if (b.data) {
    if (!ALLOWED_TYPES.includes(String(b.mimeType))) return NextResponse.json({ error: "Use a PDF, image, Word, Excel or text file" }, { status: 400 });
    if (Math.floor((String(b.data).length * 3) / 4) > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is larger than 3 MB" }, { status: 400 });
    file = { fileName: txt(b.fileName, 200), mimeType: String(b.mimeType), data: String(b.data) };
  }
  const row = await prisma.meetingMinutes.create({ data: { chairmanId: scope.chairmanId, leadId, kind: b.kind, title: txt(b.title, 200), meetingDate: date, attendees: txt(b.attendees, 3000) || null, decisions: txt(b.decisions, 6000) || null, ...(file || {}), createdById: user.id } as never });
  await writeAuditLog({ actorUserId: user.id, action: "MEETING_MINUTES_ADDED", entityType: "MeetingMinutes", entityId: row.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const m = await prisma.meetingMinutes.findUnique({ where: { id } });
  // Another institute's minutes are never reachable, even for an Institute Head.
  const myScope = await fileScope(user);
  if (!m || m.chairmanId !== myScope.chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ( (m.createdById !== user.id && user.role !== "CHAIRMAN")) return NextResponse.json({ error: "You can only remove minutes you added" }, { status: 403 });
  await prisma.meetingMinutes.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
