import { NextRequest, NextResponse } from "next/server";
import { proposalsFor, respondProposal } from "../../../../../lib/topicPlan";
import { forbidden, reply, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";

// The proposal inbox: received and sent plan proposals (current vs proposed, item by item).
export async function GET() {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  return NextResponse.json(await proposalsFor(user));
}
// POST { id, acceptAll | accept: [itemId] | reject: [itemId] | rejectAll, reason }
export async function POST(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  return reply(await respondProposal(user, String(b.id || ""), { acceptAll: !!b.acceptAll, rejectAll: !!b.rejectAll, accept: list(b.accept), reject: list(b.reject), reason: typeof b.reason === "string" ? b.reason : "" }));
}
