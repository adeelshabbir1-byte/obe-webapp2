import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { fileScope } from "../../../../lib/evidenceFiles";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scope = await fileScope(user);
  const m = (await prisma.meetingMinutes.findFirst({ where: { id: params.id, ...scope.visible("createdById") } as never })) as unknown as { data: string | null; mimeType: string | null; fileName: string | null } | null;
  if (!m || !m.data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(m.data, "base64"), { headers: { "Content-Type": m.mimeType || "application/octet-stream", "Content-Disposition": `attachment; filename="${(m.fileName || "minutes").replace(/[^\w.\- ]/g, "_")}"` } });
}
