import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { setPanel } from "../../../../lib/omcRules";

// The Convener gives a course a 3-member OMC panel for the semester (empty members clear it).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const r = await setPanel({ id: user.id }, String(b.courseId || ""), [b.m1, b.m2, b.m3].map((x) => String(x || "")));
  return "error" in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r);
}
