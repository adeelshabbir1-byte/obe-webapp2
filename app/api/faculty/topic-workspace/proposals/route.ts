import { NextRequest, NextResponse } from "next/server";
import { proposalsFor, respondProposal } from "../../../../../lib/topicPlan";
import { forbidden, reply, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// The proposal inbox: received and sent plan proposals (current vs proposed, item by item).
async function GET_handler() {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  return NextResponse.json(await proposalsFor(user));
}
// POST { id, acceptAll | accept: [itemId] | reject: [itemId] | rejectAll, reason }
async function POST_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  return reply(await respondProposal(user, String(b.id || ""), { acceptAll: !!b.acceptAll, rejectAll: !!b.rejectAll, accept: list(b.accept), reject: list(b.reject), reason: typeof b.reason === "string" ? b.reason : "" }));
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
