import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { requestInboxIds } from "../../../../lib/requests";

// How many requests need this person: asked of them and still open, or answered and waiting for them to read.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ count: 0 });
  const inbox = await requestInboxIds(user);
  const [incoming, answered] = await Promise.all([
    prisma.taskRequest.count({ where: { toId: { in: inbox }, status: "OPEN" } }),
    prisma.taskRequest.count({ where: { fromId: user.id, status: { in: ["RESPONDED", "DONE"] } } }),
  ]);
  return NextResponse.json({ count: incoming + answered });
}
