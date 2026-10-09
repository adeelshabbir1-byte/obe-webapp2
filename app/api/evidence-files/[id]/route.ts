import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { fileScope } from "../../../../lib/evidenceFiles";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scope = await fileScope(user);
  const f = await prisma.evidenceFile.findFirst({ where: { id: params.id, ...scope.visible("uploadedById") } as never });
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = f as unknown as { data: string; mimeType: string; fileName: string };
  return new NextResponse(Buffer.from(file.data, "base64"), { headers: { "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\w.\- ]/g, "_")}"` } });
}
