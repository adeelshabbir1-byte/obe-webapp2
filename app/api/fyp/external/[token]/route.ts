import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { externalByToken, saveScores } from "../../../../../lib/fyp";
import { withErrors } from "../../../../../lib/apiHandler";

// An external / industry evaluator scores the groups of their panels through their private link. Nothing else is reachable.
async function POST_handler(req: NextRequest, { params }: { params: { token: string } }) {
  const ext = await externalByToken(params.token);
  if (!ext) return NextResponse.json({ error: "This evaluation link is not valid or has expired." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const group = await prisma.fypGroup.findUnique({ where: { id: String(b.groupId || "") } });
  if (!group || group.cycleId !== ext.cycleId) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const fdb = prisma as unknown as Record<string, any>;
  // Open house: pick / drop a project to visit.
  if (b.action === "pick" || b.action === "unpick") {
    if (b.action === "pick") await fdb.fypShowcasePick.upsert({ where: { externalId_groupId: { externalId: ext.id, groupId: group.id } }, create: { externalId: ext.id, groupId: group.id }, update: {} });
    else await fdb.fypShowcasePick.deleteMany({ where: { externalId: ext.id, groupId: group.id } });
    return NextResponse.json({ ok: true });
  }
  const onPanel = group.panelId ? await prisma.fypPanelMember.findFirst({ where: { panelId: group.panelId, externalId: ext.id } }) : null;
  const ms = await prisma.fypMilestone.findFirst({ where: { id: String(b.milestoneId || ""), cycleId: group.cycleId } });
  const picked = await fdb.fypShowcasePick.count({ where: { externalId: ext.id, groupId: group.id } }).catch(() => 0);
  if (!onPanel && !(picked && ms?.kind === "OPEN_HOUSE")) return NextResponse.json({ error: "This group is not on your panel or your open-house list." }, { status: 403 });
  const scores = Array.isArray(b.scores) ? b.scores.map((s: Record<string, unknown>) => ({ criterionId: String(s.criterionId || ""), studentId: String(s.studentId || ""), score: Number(s.score) })) : [];
  if (!scores.length) return NextResponse.json({ error: "Enter the scores." }, { status: 400 });
  const r = await saveScores({ groupId: group.id, milestoneId: String(b.milestoneId || ""), evaluatorKey: `ext:${ext.id}`, evaluatorRole: "EXTERNAL", evaluatorName: `${ext.name}${ext.organization ? ` (${ext.organization})` : ""}`, scores, comments: typeof b.comments === "string" ? b.comments.slice(0, 3000) : "", recommendation: String(b.recommendation || "") });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ action: "FYP_EXTERNAL_SCORES", entityType: "FypGroup", entityId: group.id, metadata: { externalId: ext.id } });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
