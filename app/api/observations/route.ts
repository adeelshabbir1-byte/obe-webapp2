import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { record, reply, plannedTopic } from "../../../lib/observation";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  return NextResponse.json({ topic: await plannedTopic(String(sp.get("courseId") || ""), Number(sp.get("n")) || 0).catch(() => null) });
}
export async function POST(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "reply") return NextResponse.json(await reply(u as never, String(b.id), String(b.text || "")));
    return NextResponse.json(await record(u as never, b));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
