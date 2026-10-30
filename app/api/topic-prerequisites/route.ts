import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { chairmanIdFor } from "../../../lib/reportScope";
import { canEditLinks } from "../../../lib/topicLinks";
import { announceLinkChange, dropReviewPlans, strengthOf } from "../../../lib/prereqCascade";
import { withErrors } from "../../../lib/apiHandler";

const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const select = { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true } as const;

// Link a topic of one course to the topic of another course that needs it ("Functions" in PF -> "Methods" in OOP).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const prereqTopic = clean(b.prereqTopic), dependentTopic = clean(b.dependentTopic), note = clean(b.note, 500);
  if (!b.prereqCourseId || !b.dependentCourseId || !prereqTopic || !dependentTopic) return NextResponse.json({ error: "Choose a topic in each course." }, { status: 400 });
  if (b.prereqCourseId === b.dependentCourseId) return NextResponse.json({ error: "Pick two different courses." }, { status: 400 });
  const [a, d] = await Promise.all([
    prisma.course.findUnique({ where: { id: String(b.prereqCourseId) }, select }),
    prisma.course.findUnique({ where: { id: String(b.dependentCourseId) }, select }),
  ]);
  if (!a || !d) return NextResponse.json({ error: "course not found" }, { status: 404 });
  if (a.code === d.code) return NextResponse.json({ error: "Pick two different courses." }, { status: 400 });
  if (!(await canEditLinks(user, a, d))) return NextResponse.json({ error: "Only the Subject Expert of one of these courses, the Program Lead or the OMC can link their topics." }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const strength = strengthOf(b.strength);
  try {
    const where = { coordinatorId_prereqCourseCode_prereqTopic_dependentCourseCode_dependentTopic: { coordinatorId: a.coordinatorId, prereqCourseCode: a.code, prereqTopic, dependentCourseCode: d.code, dependentTopic } };
    const before = await prisma.topicPrerequisite.findUnique({ where });
    const link = await prisma.topicPrerequisite.upsert({
      where,
      create: { chairmanId, coordinatorId: a.coordinatorId, prereqCourseCode: a.code, prereqCourseTitle: a.title, prereqTopic, dependentCourseCode: d.code, dependentCourseTitle: d.title, dependentTopic, note: note || null, strength, createdById: user.id },
      update: { note: note || null, prereqCourseTitle: a.title, dependentCourseTitle: d.title, strength, orphanedAt: null },
    });
    await writeAuditLog({ actorUserId: user.id, action: "TOPIC_PREREQUISITE_LINKED", entityType: "TopicPrerequisite", entityId: link.id, metadata: { from: `${a.code}: ${prereqTopic}`, to: `${d.code}: ${dependentTopic}`, strength } });
    // The change reaches every offering of the dependent course at once; their teachers are told what it means.
    if (strength === "STRONG") await dropReviewPlans(link);
    if (!before || before.strength !== strength) await announceLinkChange(link, before ? "STRENGTH" : "ADDED", user, note ? `Note: ${note}` : "");
    return NextResponse.json({ link });
  } catch (e) {
    return NextResponse.json({ error: "The prerequisite-topic tables are not up to date — run prisma/migration_oct2026_features.sql and prisma/migration_master_spec.sql in Supabase." }, { status: 500 });
  }
}

// Change a link's strength (Strong / Mild / Weak).
async function PATCH_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const link = await prisma.topicPrerequisite.findUnique({ where: { id: String(b.id || "") } }).catch(() => null);
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [a, d] = await Promise.all([
    prisma.course.findFirst({ where: { coordinatorId: link.coordinatorId, code: link.prereqCourseCode }, select }),
    prisma.course.findFirst({ where: { coordinatorId: link.coordinatorId, code: link.dependentCourseCode }, select }),
  ]);
  if (!a || !d || !(await canEditLinks(user, a, d))) return NextResponse.json({ error: "Only the Subject Expert of one of these courses, the Program Lead or the OMC can change this link." }, { status: 403 });
  const strength = strengthOf(b.strength);
  if (strength === link.strength) return NextResponse.json({ link });
  try {
    const updated = await prisma.topicPrerequisite.update({ where: { id: link.id }, data: { strength } });
    if (strength === "STRONG") await dropReviewPlans(updated); // registration now enforces it instead of a review
    await writeAuditLog({ actorUserId: user.id, action: "TOPIC_PREREQUISITE_STRENGTH", entityType: "TopicPrerequisite", entityId: link.id, metadata: { from: link.strength, to: strength } });
    const reached = await announceLinkChange(updated, "STRENGTH", user);
    return NextResponse.json({ link: updated, reached });
  } catch {
    return NextResponse.json({ error: "Run prisma/migration_master_spec.sql in Supabase first." }, { status: 500 });
  }
}

async function DELETE_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const link = await prisma.topicPrerequisite.findUnique({ where: { id } }).catch(() => null);
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Anyone allowed to link the two courses may remove the link.
  const [a, d] = await Promise.all([
    prisma.course.findFirst({ where: { coordinatorId: link.coordinatorId, code: link.prereqCourseCode }, select }),
    prisma.course.findFirst({ where: { coordinatorId: link.coordinatorId, code: link.dependentCourseCode }, select }),
  ]);
  const allowed = link.createdById === user.id || (a && d && (await canEditLinks(user, a, d)));
  if (!allowed) return NextResponse.json({ error: "Only the Subject Expert of one of these courses, the Program Lead or the OMC can remove this link." }, { status: 403 });
  await dropReviewPlans(link);
  await prisma.topicPrerequisite.delete({ where: { id } });
  await writeAuditLog({ actorUserId: user.id, action: "TOPIC_PREREQUISITE_REMOVED", entityType: "TopicPrerequisite", entityId: id, metadata: { from: `${link.prereqCourseCode}: ${link.prereqTopic}`, to: `${link.dependentCourseCode}: ${link.dependentTopic}` } });
  await announceLinkChange(link, "REMOVED", user);
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
export const PATCH = withErrors(PATCH_handler);
export const DELETE = withErrors(DELETE_handler);
