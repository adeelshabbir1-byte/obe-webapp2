import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { planAct } from "../../../lib/planVote";

// OMC votes on a Subject Expert's plan: vote · suggest · reply (SE) · recheck (SE) · confirm / finalise (Convener).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.courseId) return NextResponse.json({ error: "courseId is required." }, { status: 400 });
  const r = await planAct({ id: user.id, name: user.name, role: user.role }, String(body.courseId), body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
