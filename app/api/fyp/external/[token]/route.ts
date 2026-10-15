import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { externalByToken, saveScores } from "../../../../../lib/fyp";

// An external / industry evaluator scores the groups of their panels through their private link. Nothing else is reachable.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ext = await externalByToken(params.token);
  if (!ext) return NextResponse.json({ error: "This evaluation link is not valid or has expired." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const group = await prisma.fypGroup.findUnique({ where: { id: String(b.groupId || "") } });
  const onPanel = group?.panelId ? await prisma.fypPanelMember.findFirst({ where: { panelId: group.panelId, externalId: ext.id } }) : null;
  if (!group || !onPanel) return NextResponse.json({ error: "This group is not on your panel." }, { status: 403 });
  const scores = Array.isArray(b.scores) ? b.scores.map((s: Record<string, unknown>) => ({ criterionId: String(s.criterionId || ""), studentId: String(s.studentId || ""), score: Number(s.score) })) : [];
  if (!scores.length) return NextResponse.json({ error: "Enter the scores." }, { status: 400 });
  const r = await saveScores({ groupId: group.id, milestoneId: String(b.milestoneId || ""), evaluatorKey: `ext:${ext.id}`, evaluatorRole: "EXTERNAL", evaluatorName: `${ext.name}${ext.organization ? ` (${ext.organization})` : ""}`, scores, comments: typeof b.comments === "string" ? b.comments.slice(0, 3000) : "", recommendation: String(b.recommendation || "") });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ action: "FYP_EXTERNAL_SCORES", entityType: "FypGroup", entityId: group.id, metadata: { externalId: ext.id } });
  return NextResponse.json({ ok: true });
}
