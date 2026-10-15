import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { chairmanIdFor } from "../../../lib/reportScope";
import { canEditLinks } from "../../../lib/topicLinks";
import { notifyUsers } from "../../../lib/notifications";

const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const select = { id: true, code: true, title: true, coordinatorId: true, subjectExpertId: true, instructorId: true } as const;

// Link a topic of one course to the topic of another course that needs it ("Functions" in PF -> "Methods" in OOP).
export async function POST(req: NextRequest) {
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
  try {
    const link = await prisma.topicPrerequisite.upsert({
      where: { coordinatorId_prereqCourseCode_prereqTopic_dependentCourseCode_dependentTopic: { coordinatorId: a.coordinatorId, prereqCourseCode: a.code, prereqTopic, dependentCourseCode: d.code, dependentTopic } },
      create: { chairmanId, coordinatorId: a.coordinatorId, prereqCourseCode: a.code, prereqCourseTitle: a.title, prereqTopic, dependentCourseCode: d.code, dependentCourseTitle: d.title, dependentTopic, note: note || null, createdById: user.id },
      update: { note: note || null, prereqCourseTitle: a.title, dependentCourseTitle: d.title },
    });
    await writeAuditLog({ actorUserId: user.id, action: "TOPIC_PREREQUISITE_LINKED", entityType: "TopicPrerequisite", entityId: link.id, metadata: { from: `${a.code}: ${prereqTopic}`, to: `${d.code}: ${dependentTopic}` } });
    await notifyUsers([a.subjectExpertId, d.subjectExpertId, a.instructorId, d.instructorId], {
      kind: "TOPIC_LINK", title: `Prerequisite topic: "${prereqTopic}" (${a.code}) is needed for "${dependentTopic}" (${d.code})`,
      body: `${user.name} linked these topics. ${a.code} should teach and assess "${prereqTopic}" well, and when both courses run in the same semester it should come first.${note ? ` Note: ${note}` : ""}`,
      href: `/topic-prerequisites?a=${a.id}&b=${d.id}`, exceptId: user.id,
    });
    return NextResponse.json({ link });
  } catch (e) {
    return NextResponse.json({ error: "The prerequisite-topic table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
  await prisma.topicPrerequisite.delete({ where: { id } });
  await writeAuditLog({ actorUserId: user.id, action: "TOPIC_PREREQUISITE_REMOVED", entityType: "TopicPrerequisite", entityId: id, metadata: { from: `${link.prereqCourseCode}: ${link.prereqTopic}`, to: `${link.dependentCourseCode}: ${link.dependentTopic}` } });
  return NextResponse.json({ ok: true });
}
