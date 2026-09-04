import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const chairmanId = user.role === "SUPER_USER" ? null : await chairmanIdFor(user);
  const chairman = chairmanId ? await prisma.user.findUnique({ where: { id: chairmanId } }) : null;

  return NextResponse.json({ instituteName: chairman?.instituteName || null });
}
