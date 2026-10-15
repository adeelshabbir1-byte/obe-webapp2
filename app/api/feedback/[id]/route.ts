import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { updateFeedback } from "../../../../lib/feedback";

// The Super User answers feedback, moves it along, and recognises the useful ones.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await updateFeedback(user, params.id, {
    status: b.status !== undefined ? String(b.status) : undefined,
    adminReply: b.adminReply !== undefined ? String(b.adminReply) : undefined,
    recognize: b.recognize !== undefined ? !!b.recognize : undefined,
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "not found" ? 404 : 400 });
  await writeAuditLog({ actorUserId: user.id, action: "FEEDBACK_UPDATED", entityType: "SystemFeedback", entityId: params.id, metadata: { status: r.feedback.status, recognized: r.feedback.recognized } });
  return NextResponse.json(r);
}
