import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { xdb, loadSession, parse, invigilatorPool, type ExamPaperRow } from "../../../../../lib/exams";
import { ebdb, examChairman, swapMode } from "../../../../../lib/examBranch";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { notifyUsers } from "../../../../../lib/notifications";
import { writeAuditLog } from "../../../../../lib/audit";
import { withErrors } from "../../../../../lib/apiHandler";

type Swap = { id: string; sessionId: string; paperId: string; roomId: string; fromUserId: string; toUserId: string; status: string };
const slotOf = (p: ExamPaperRow) => `${p.date ? new Date(p.date).toISOString().slice(0, 10) : ""}:${p.slot}`;

/** Hand a duty from one person to another, if the new person is free at that time. */
async function execute(sw: Swap) {
  const paper = (await xdb.examPaper.findUnique({ where: { id: sw.paperId } })) as ExamPaperRow | null;
  if (!paper) return "The paper no longer exists.";
  const all = (await xdb.examPaper.findMany({ where: { sessionId: sw.sessionId } })) as ExamPaperRow[];
  const busy = all.some((p) => slotOf(p) === slotOf(paper) && parse<{ userIds: string[] }[]>(p.invigilatorsJson, []).some((r) => r.userIds.includes(sw.toUserId)));
  if (busy) return "That colleague already has a duty at the same time.";
  const inv = parse<{ roomId: string; userIds: string[] }[]>(paper.invigilatorsJson, []);
  const r = inv.find((x) => x.roomId === sw.roomId && x.userIds.includes(sw.fromUserId));
  if (!r) return "That duty has already changed.";
  r.userIds = r.userIds.map((u) => (u === sw.fromUserId ? sw.toUserId : u));
  await xdb.examPaper.update({ where: { id: paper.id }, data: { invigilatorsJson: JSON.stringify(inv) } });
  return null;
}

async function POST_handler(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== (await chairmanIdFor(user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const branch = (await examChairman(user)) === s.chairmanId;
  try {
    if (b.action === "request" || b.action === "assign") {
      const paper = (await xdb.examPaper.findFirst({ where: { id: String(b.paperId || ""), sessionId: s.id } })) as ExamPaperRow | null;
      const fromUserId = b.action === "assign" ? String(b.fromUserId || "") : user.id;
      if (b.action === "assign" && !branch) return NextResponse.json({ error: "Only the exam branch reassigns duties." }, { status: 403 });
      if (!paper || !parse<{ roomId: string; userIds: string[] }[]>(paper.invigilatorsJson, []).some((r) => r.roomId === b.roomId && r.userIds.includes(fromUserId))) return NextResponse.json({ error: "That duty was not found." }, { status: 404 });
      const to = String(b.toUserId || "");
      if (to === fromUserId || !(await invigilatorPool(s.chairmanId)).some((u) => u.id === to)) return NextResponse.json({ error: "Choose a colleague." }, { status: 400 });
      const status = b.action === "assign" ? "DONE" : await swapMode(s.id);
      const sw = (await ebdb.dutySwap.create({ data: { sessionId: s.id, paperId: paper.id, roomId: String(b.roomId), fromUserId, toUserId: to, status, note: typeof b.note === "string" ? b.note.slice(0, 300) : null, ...(status === "DONE" ? { decidedById: user.id, decidedAt: new Date() } : {}) } })) as Swap;
      if (status === "DONE") { const err = await execute(sw); if (err) { await ebdb.dutySwap.update({ where: { id: sw.id }, data: { status: "DECLINED", note: err } }); return NextResponse.json({ error: err }, { status: 400 }); } await notifyUsers([to, fromUserId], { kind: "ASSIGNMENT", title: `${s.name}: invigilation duty changed`, body: "The exam branch changed a duty. See My Duties.", href: `/exams/${s.id}/my-duties` }); }
      else if (status === "PEER") await notifyUsers([to], { kind: "ASSIGNMENT", title: `${s.name}: ${user.name} asks you to take a duty`, body: "Accept or decline under My Duties (today only).", href: `/exams/${s.id}/my-duties` });
      else { const staff = (await ebdb.examStaff.findMany({ where: { chairmanId: s.chairmanId }, select: { userId: true } })) as { userId: string }[]; await notifyUsers(staff.map((x) => x.userId), { kind: "ASSIGNMENT", title: `${s.name}: duty change request`, body: `${user.name} asks to hand a duty to a colleague.`, href: `/exams/${s.id}/my-duties` }); }
      await writeAuditLog({ actorUserId: user.id, action: "EXAM_DUTY_SWAP_" + status, entityType: "DutySwap", entityId: sw.id, metadata: { paperId: paper.id, to } });
      return NextResponse.json({ ok: true, status });
    }
    const sw = (await ebdb.dutySwap.findFirst({ where: { id: String(b.swapId || ""), sessionId: s.id } })) as Swap | null;
    if (!sw) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (b.action === "cancel" && sw.fromUserId === user.id && ["PEER", "BRANCH"].includes(sw.status)) { await ebdb.dutySwap.update({ where: { id: sw.id }, data: { status: "CANCELLED" } }); return NextResponse.json({ ok: true }); }
    const canDecide = (sw.status === "PEER" && sw.toUserId === user.id) || (sw.status === "BRANCH" && branch);
    if (b.action === "decide" && canDecide) {
      if (!b.accept) { await ebdb.dutySwap.update({ where: { id: sw.id }, data: { status: "DECLINED", decidedById: user.id, decidedAt: new Date() } }); await notifyUsers([sw.fromUserId], { kind: "ASSIGNMENT", title: `${s.name}: duty change declined`, href: `/exams/${s.id}/my-duties` }); return NextResponse.json({ ok: true }); }
      const err = await execute(sw);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      await ebdb.dutySwap.update({ where: { id: sw.id }, data: { status: "DONE", decidedById: user.id, decidedAt: new Date() } });
      await notifyUsers([sw.fromUserId, sw.toUserId].filter((x) => x !== user.id), { kind: "ASSIGNMENT", title: `${s.name}: duty change done`, href: `/exams/${s.id}/my-duties` });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_exam_branch.sql first." }, { status: 500 }); }
}
void prisma;
export const POST = withErrors(POST_handler);
