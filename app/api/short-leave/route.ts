import { NextRequest, NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { sdb, syncClasses, approversForTeacher, type ShortLeaveRow } from "../../../lib/shortLeave";
import { checkRequest, saveDetail, workingDays, policies } from "../../../lib/leaveRules";
import { withErrors } from "../../../lib/apiHandler";

// POST { fromDate, toDate, reason } — a teacher asks for a few days' leave. Their classes in those days are listed
// from the timetable so the Chairman can arrange cover.
async function POST_handler(req: NextRequest) {
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const from = new Date(`${b.fromDate}T00:00:00Z`), to = new Date(`${b.toDate}T00:00:00Z`);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return NextResponse.json({ error: "Choose the first and last day of the leave." }, { status: 400 });
  if ((to.getTime() - from.getTime()) / 864e5 > 366) return NextResponse.json({ error: "For more than a year, ask the Chairman to record semester leave." }, { status: 400 });
  const reason = String(b.reason || "").trim().slice(0, 1000);
  if (reason.length < 3) return NextResponse.json({ error: "Give a reason." }, { status: 400 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "No institute on record for your account." }, { status: 400 });
  const kind = String(b.kind || "CASUAL"), days = workingDays(from, to);
  const typed = await policies(chairmanId).then((p) => p.find((x) => x.kind === kind)).catch(() => null);
  const problem = await checkRequest(user.id, chairmanId, kind, days).catch(() => null);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const row = (await sdb.shortLeave.create({ data: { userId: user.id, chairmanId, fromDate: from, toDate: to, reason } })) as ShortLeaveRow;
  await saveDetail(row.id, kind, days).catch(() => {});
  const n = await syncClasses(row);
  await writeAuditLog({ actorUserId: user.id, action: "SHORT_LEAVE_REQUESTED", entityType: "User", entityId: user.id, metadata: { from: b.fromDate, to: b.toDate, classes: n } });
  await notifyUsers(await approversForTeacher(user.id, chairmanId), { kind: "REQUEST", title: `${typed?.label || "Leave"} request: ${user.name}, ${b.fromDate}${b.toDate !== b.fromDate ? ` to ${b.toDate}` : ""}`, body: `${reason}. ${n} class(es) need cover.`, href: "/leave-approvals", exceptId: user.id });
  return NextResponse.json({ ok: true, id: row.id, classes: n });
}
export const POST = withErrors(POST_handler);
