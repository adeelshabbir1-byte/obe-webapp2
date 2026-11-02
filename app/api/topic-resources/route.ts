import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { addRes, removeRes } from "../../../lib/topicResources";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "remove") return NextResponse.json(await removeRes(u as never, String(b.courseId), String(b.id)));
    return NextResponse.json(await addRes(u as never, String(b.courseId), b));
  } catch (e) { const m = (e as Error).message; return NextResponse.json({ error: m === "forbidden" ? "Only this course's teachers, its Subject Expert or the Program Lead add resources." : m }, { status: 400 }); }
}
