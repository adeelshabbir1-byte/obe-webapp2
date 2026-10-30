import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { adb, appraiseesFor, computeScorecard, REVIEWER_ROLES, OVERALL, RATING_AREAS, type AppraisalRow } from "../../../lib/appraisal";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 120;

// PUT { userId, year, ratings, studentFeedback, overall, strengths, improve, goals, action: "save" | "share" | "finalise" | "reopen" }
// — the reviewer (Institute Head, or the teacher's Chairman) writes the appraisal. Sharing freezes the year's figures and
// lets the teacher read it and reply; finalising signs it off.
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !REVIEWER_ROLES.includes(user.role)) return NextResponse.json({ error: "Only the Institute Head or the Chairman appraises faculty." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const userId = String(b.userId || ""), year = parseInt(String(b.year), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ error: "Choose a year." }, { status: 400 });
  const { chairmanId, people } = await appraiseesFor(user);
  if (!people.some((p) => p.id === userId) || userId === user.id) return NextResponse.json({ error: "You can't appraise this person." }, { status: 403 });
  const existing = (await adb.facultyAppraisal.findUnique({ where: { userId_year: { userId, year } } })) as AppraisalRow | null;
  if (existing?.status === "FINAL" && b.action !== "reopen") return NextResponse.json({ error: "This appraisal is final. Reopen it to change it." }, { status: 409 });

  const ratings: Record<string, number> = {};
  for (const [k] of RATING_AREAS) { const v = Number(b.ratings?.[k]); if (Number.isInteger(v) && v >= 1 && v <= 5) ratings[k] = v; }
  const fb = b.studentFeedback === "" || b.studentFeedback === null || b.studentFeedback === undefined ? null : Number(b.studentFeedback);
  if (fb !== null && (!Number.isFinite(fb) || fb < 1 || fb > 5)) return NextResponse.json({ error: "Student feedback score must be between 1 and 5." }, { status: 400 });
  const overall = b.overall && OVERALL[b.overall] ? String(b.overall) : null;
  const txt = (v: unknown) => (v ? String(v).trim().slice(0, 3000) : null);
  const action = String(b.action || "save");
  if ((action === "share" || action === "finalise") && (!overall || Object.keys(ratings).length < RATING_AREAS.length)) return NextResponse.json({ error: "Give every rating and an overall rating before sharing." }, { status: 400 });

  const data: Record<string, unknown> = { reviewerId: user.id, ratingsJson: JSON.stringify(ratings), studentFeedback: fb, overall, strengths: txt(b.strengths), improve: txt(b.improve), goals: txt(b.goals) };
  if (action === "share" || action === "finalise") data.metricsJson = JSON.stringify(await computeScorecard(userId, year, { deep: true }));
  data.status = action === "share" ? "SHARED" : action === "finalise" ? "FINAL" : action === "reopen" ? "SHARED" : existing?.status === "SHARED" ? "SHARED" : "DRAFT";
  await adb.facultyAppraisal.upsert({ where: { userId_year: { userId, year } }, update: data, create: { userId, year, chairmanId, ...data } });
  await writeAuditLog({ actorUserId: user.id, action: `APPRAISAL_${action.toUpperCase()}`, entityType: "User", entityId: userId, metadata: { year, overall } });
  if (action === "share" || action === "finalise") await notifyUsers([userId], { kind: "ASSIGNMENT", title: `Your ${year} appraisal is ${action === "share" ? "ready to read" : "final"}`, body: `${user.name} ${action === "share" ? "shared your annual appraisal. Read it and add your comments." : "signed off your annual appraisal."}`, href: `/appraisals/${userId}?year=${year}` });
  return NextResponse.json({ ok: true, status: data.status });
}
export const PUT = withErrors(PUT_handler);
