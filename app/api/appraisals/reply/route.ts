import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getSignedInUser } from "../../../../lib/session";
import { notifyUsers } from "../../../../lib/notifications";
import { adb, type AppraisalRow } from "../../../../lib/appraisal";

// POST { year, comment, acknowledge } — the teacher replies to their shared appraisal and confirms they have read it.
export async function POST(req: NextRequest) {
  const user = (await getSignedInUser()) || (await getAuthenticatedUser());
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const year = parseInt(String(b.year), 10);
  const a = (await adb.facultyAppraisal.findUnique({ where: { userId_year: { userId: user.id, year } } })) as AppraisalRow | null;
  if (!a || a.status === "DRAFT") return NextResponse.json({ error: "Your appraisal has not been shared with you yet." }, { status: 404 });
  await adb.facultyAppraisal.update({ where: { id: a.id }, data: { facultyComment: b.comment ? String(b.comment).slice(0, 3000) : a.facultyComment, acknowledgedAt: b.acknowledge ? new Date() : a.acknowledgedAt } });
  await notifyUsers([a.reviewerId], { kind: "REQUEST", title: `${user.name} replied to their ${year} appraisal`, body: b.comment ? String(b.comment).slice(0, 300) : "Acknowledged.", href: `/appraisals/${user.id}?year=${year}` });
  return NextResponse.json({ ok: true });
}
