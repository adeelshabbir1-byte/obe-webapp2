import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { notifyUsers } from "./notifications";
import { appendTopic } from "./facultyTopicWorkspace";
import { blockedAsNonBaseCourse } from "./contentSync";

// A teacher cannot change another teacher's course, but can suggest a topic to it (from the Topic Workspace).
// The course's Subject Expert and Instructor are told; whichever of them accepts gets the topic at the end of their
// own plan (the Subject Expert's template or the Instructor's delivery copy). The suggester hears back either way.

type Who = { id: string; role: string; managedById: string | null; name: string };
export type SuggestionRow = { id: string; chairmanId: string; fromUserId: string; fromCourseId: string | null; toCourseId: string; topic: string; subtopic: string | null; note: string | null; status: string; respondedById: string | null; respondedAt: Date | null; createdAt: Date };

export async function createSuggestion(user: Who, input: { fromCourseId?: string | null; toCourseId: string; topic: string; subtopic?: string | null; note?: string | null }) {
  const topic = (input.topic || "").trim().slice(0, 300);
  if (!topic) return { error: "The topic is empty." };
  const chairmanId = await chairmanIdFor(user);
  const to = await prisma.course.findFirst({ where: { id: input.toCourseId, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, title: true, subjectExpertId: true, instructorId: true } });
  if (!to) return { error: "That course was not found in your institute." };
  if (to.subjectExpertId === user.id || to.instructorId === user.id) return { error: "This is your own course — add the topic in the workspace instead of suggesting it." };
  const from = input.fromCourseId ? await prisma.course.findUnique({ where: { id: input.fromCourseId }, select: { id: true, code: true } }) : null;
  const dup = await prisma.topicSuggestion.findFirst({ where: { toCourseId: to.id, fromUserId: user.id, topic, status: "PENDING" } });
  if (dup) return { error: "You have already suggested this topic to that course; it is waiting for an answer." };
  const s = await prisma.topicSuggestion.create({ data: { chairmanId, fromUserId: user.id, fromCourseId: from?.id || null, toCourseId: to.id, topic, subtopic: input.subtopic?.trim().slice(0, 500) || null, note: input.note?.trim().slice(0, 1000) || null } });
  await notifyUsers([to.subjectExpertId, to.instructorId], {
    kind: "TOPIC_SUGGESTION", title: `${user.name} suggests the topic "${topic}" for ${to.code}`,
    body: `${from ? `From ${from.code}. ` : ""}${s.note || "Accept it to add it to the end of your lecture plan, or decline it."}`,
    href: "/faculty/topic-workspace?tab=suggestions", exceptId: user.id,
  });
  return { suggestion: s };
}

/** Suggestions waiting on this person's courses, and the ones they sent. */
export async function suggestionsFor(user: { id: string }) {
  try {
    const mine = await prisma.course.findMany({ where: { OR: [{ subjectExpertId: user.id }, { instructorId: user.id }] }, select: { id: true } });
    const [received, sent] = await Promise.all([
      prisma.topicSuggestion.findMany({ where: { toCourseId: { in: mine.map((c) => c.id).concat(["none"]) } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 200 }),
      prisma.topicSuggestion.findMany({ where: { fromUserId: user.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    return { received: received as SuggestionRow[], sent: sent as SuggestionRow[], missingTable: false };
  } catch {
    return { received: [] as SuggestionRow[], sent: [] as SuggestionRow[], missingTable: true };
  }
}

export async function respondToSuggestion(user: Who, id: string, accept: boolean) {
  const s = await prisma.topicSuggestion.findUnique({ where: { id } }).catch(() => null);
  if (!s) return { error: "not found" };
  if (s.status !== "PENDING") return { error: "This suggestion has already been answered." };
  const course = await prisma.course.findUnique({ where: { id: s.toCourseId }, select: { id: true, code: true, subjectExpertId: true, instructorId: true, templateStatus: true } });
  if (!course) return { error: "course not found" };
  const asSe = course.subjectExpertId === user.id && user.role === "SUBJECT_EXPERT";
  const asInstructor = course.instructorId === user.id && user.role === "INSTRUCTOR";
  if (!asSe && !asInstructor) return { error: course.subjectExpertId === user.id || course.instructorId === user.id ? "Switch to the role you hold on this course (Subject Expert or Instructor) to answer." : "Only this course's Subject Expert or Instructor can answer." };
  if (accept) {
    if (asSe) {
      if (course.templateStatus === "approved") return { error: "The plan of this course is approved by the OMC and locked, so a topic can't be added." };
      const blocked = await blockedAsNonBaseCourse(course.id);
      if (blocked) return { error: blocked };
    }
    await appendTopic(course.id, asSe ? "SE" : "INSTRUCTOR", s.topic, s.subtopic);
  }
  const updated = await prisma.topicSuggestion.update({ where: { id }, data: { status: accept ? "ACCEPTED" : "DECLINED", respondedById: user.id, respondedAt: new Date() } });
  await notifyUsers([s.fromUserId], {
    kind: "TOPIC_SUGGESTION", title: `${course.code}: your topic "${s.topic}" was ${accept ? "accepted" : "declined"}`,
    body: accept ? `${user.name} added it to the end of the ${asSe ? "Subject Expert's plan" : "Instructor's plan"}.` : `${user.name} declined it.`,
    href: "/faculty/topic-workspace?tab=suggestions", exceptId: user.id,
  });
  return { suggestion: updated };
}
