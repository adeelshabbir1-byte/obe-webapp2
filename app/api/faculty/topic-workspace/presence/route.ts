import { NextRequest, NextResponse } from "next/server";
import { touchPresence } from "../../../../../lib/topicPlan";
import { forbidden, wsUser } from "../../../../../lib/topicApi";

// POST {courseIds} — "I have these open"; answers who else has them open right now.
export async function POST(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.courseIds) ? b.courseIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 40) : [];
  return NextResponse.json({ others: await touchPresence(user, ids) });
}
