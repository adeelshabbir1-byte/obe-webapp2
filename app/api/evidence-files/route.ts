import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { ALLOWED_TYPES, FILE_ROLES, MAX_FILE_BYTES, fileScope } from "../../../lib/evidenceFiles";

const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !FILE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const scope = await fileScope(user);
  const title = txt(b.title, 200), fileName = txt(b.fileName, 200), mimeType = txt(b.mimeType, 120), data = String(b.data || "");
  if (!title || !fileName || !data) return NextResponse.json({ error: "Give the file a title and choose a file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(mimeType)) return NextResponse.json({ error: "Use a PDF, image, Word, Excel, PowerPoint or text file" }, { status: 400 });
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is larger than 3 MB. Make it smaller, or split it." }, { status: 400 });
  const leadId = b.leadId ? String(b.leadId) : null;
  if (leadId && !scope.leadIds.includes(leadId)) return NextResponse.json({ error: "That program is not in your area" }, { status: 403 });
  const crit = b.criterion ? Number(b.criterion) : null;
  if (crit !== null && !(crit >= 1 && crit <= 9)) return NextResponse.json({ error: "Criterion must be 1 to 9" }, { status: 400 });
  const row = await prisma.evidenceFile.create({ data: { chairmanId: scope.chairmanId, leadId, criterion: crit, title, note: txt(b.note, 1000) || null, fileName, mimeType, size: bytes, data, uploadedById: user.id } as never });
  await writeAuditLog({ actorUserId: user.id, action: "EVIDENCE_FILE_ADDED", entityType: "EvidenceFile", entityId: row.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const scope = await fileScope(user);
  const f = await prisma.evidenceFile.findFirst({ where: { id, ...scope.visible("uploadedById") } as never, select: { id: true, uploadedById: true } });
  if (!f || (f.uploadedById !== user.id && user.role !== "CHAIRMAN")) return NextResponse.json({ error: "You can only remove files you added" }, { status: 403 });
  await prisma.evidenceFile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
