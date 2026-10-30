import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { rdb2, METRICS, RECOGNITION_MANAGERS } from "../../../../lib/recognition";
import { withErrors } from "../../../../lib/apiHandler";

// POST { title, metric, targetPct, dueDate } — a department goal everyone sees (the Chairman's goal is for their
// department; the Institute Head's for the whole institute). DELETE ?id= removes one.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !RECOGNITION_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim().slice(0, 200), metric = String(b.metric || "");
  const due = new Date(`${b.dueDate}T00:00:00Z`), target = parseInt(String(b.targetPct), 10);
  if (!title || !METRICS[metric] || isNaN(due.getTime()) || !(target >= 1 && target <= 100)) return NextResponse.json({ error: "Give a title, what to measure, a target % and a date." }, { status: 400 });
  await rdb2.recognitionGoal.create({ data: { chairmanId: await chairmanIdFor(user), departmentId: user.role === "HEAD_OF_DEPARTMENT" ? user.departmentId || null : null, title, metric, targetPct: target, dueDate: due, createdById: user.id } });
  return NextResponse.json({ ok: true });
}
async function DELETE_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !RECOGNITION_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  await rdb2.recognitionGoal.deleteMany({ where: { id, chairmanId: await chairmanIdFor(user), ...(user.role === "HEAD_OF_DEPARTMENT" ? { departmentId: user.departmentId || "none" } : {}) } });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
export const DELETE = withErrors(DELETE_handler);
