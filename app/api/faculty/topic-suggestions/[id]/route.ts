import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { writeAuditLog } from "../../../../../lib/audit";
import { respondToSuggestion } from "../../../../../lib/topicSuggestions";
import { withErrors } from "../../../../../lib/apiHandler";

// Accept (adds the topic at the end of your plan) or decline a suggested topic.
async function PATCH_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.decision !== "ACCEPT" && b.decision !== "DECLINE") return NextResponse.json({ error: "decision must be ACCEPT or DECLINE" }, { status: 400 });
  const r = await respondToSuggestion(user, params.id, b.decision === "ACCEPT");
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: b.decision === "ACCEPT" ? "TOPIC_SUGGESTION_ACCEPTED" : "TOPIC_SUGGESTION_DECLINED", entityType: "TopicSuggestion", entityId: params.id });
  return NextResponse.json(r);
}
export const PATCH = withErrors(PATCH_handler);
