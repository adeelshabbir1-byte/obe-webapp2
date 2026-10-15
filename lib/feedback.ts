import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { currentSemester } from "./recognition";
import { notifyUsers } from "./notifications";

// Feedback to the platform: any staff user sends an idea or a problem; the Super User (platform owner) reads it,
// answers, tracks it to done, and recognises the feedback that improved the system — the sender gets a
// "System Improver" badge on their recognition record and appears on the contributors list.

export const CATEGORIES: Record<string, string> = { IDEA: "Idea / improvement", PROBLEM: "Something is wrong", USABILITY: "Hard to use", OTHER: "Other" };
export const STATUSES: Record<string, [string, string]> = {
  NEW: ["New", "badge-warn"], UNDER_REVIEW: ["Under review", "badge-neutral"], PLANNED: ["Planned", "badge-neutral"], DONE: ["Done", "badge-ok"], DECLINED: ["Not planned", "badge-no"],
};
export type FeedbackRow = { id: string; userId: string; chairmanId: string | null; role: string; category: string; title: string; body: string; pageUrl: string | null; status: string; adminReply: string | null; recognized: boolean; createdAt: Date; updatedAt: Date };

export async function createFeedback(user: { id: string; role: string; managedById: string | null; name: string }, input: { category: string; title: string; body: string; pageUrl?: string | null }) {
  const title = (input.title || "").trim().slice(0, 160), body = (input.body || "").trim().slice(0, 5000);
  if (title.length < 4) return { error: "Give it a short title." };
  if (body.length < 10) return { error: "Describe it in a sentence or two, so it can be acted on." };
  const category = CATEGORIES[input.category] ? input.category : "OTHER";
  const pageUrl = input.pageUrl && /^\/[\w\-/?=&.%]*$/.test(input.pageUrl) ? input.pageUrl.slice(0, 300) : null;
  const chairmanId = user.role === "SUPER_USER" ? null : (await chairmanIdFor(user)) || null;
  const row = await prisma.systemFeedback.create({ data: { userId: user.id, chairmanId, role: user.role, category, title, body, pageUrl } });
  const owners = (await prisma.user.findMany({ where: { role: "SUPER_USER", isActive: true }, select: { id: true } })).map((u) => u.id);
  await notifyUsers(owners, { kind: "FEEDBACK", title: `Feedback from ${user.name}: ${title}`, body: body.slice(0, 400), href: "/admin/feedback", exceptId: user.id });
  return { feedback: row };
}

/** The Super User's update: status, reply, and recognition (which also gives the sender a badge). */
export async function updateFeedback(owner: { id: string }, id: string, input: { status?: string; adminReply?: string; recognize?: boolean }) {
  const f = await prisma.systemFeedback.findUnique({ where: { id } });
  if (!f) return { error: "not found" };
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) { if (!STATUSES[input.status]) return { error: "unknown status" }; data.status = input.status; }
  if (input.adminReply !== undefined) data.adminReply = input.adminReply.trim().slice(0, 3000) || null;
  if (input.recognize !== undefined) data.recognized = !!input.recognize;
  if (!Object.keys(data).length) return { error: "nothing to change" };
  const updated = await prisma.systemFeedback.update({ where: { id }, data });
  if (input.recognize && !f.recognized && f.chairmanId) {
    const sem = await currentSemester(f.chairmanId).catch(() => null);
    const term = sem?.label || String(new Date().getFullYear());
    await prisma.recognitionBadge.upsert({
      where: { userId_term_badgeKey_title: { userId: f.userId, term, badgeKey: "SYSTEM_IMPROVER", title: "System Improver" } },
      create: { chairmanId: f.chairmanId, userId: f.userId, term, badgeKey: "SYSTEM_IMPROVER", title: "System Improver", reason: `Feedback that improved the system: ${f.title}`, awardedById: owner.id },
      update: { reason: `Feedback that improved the system: ${f.title}` },
    }).catch(() => null);
  }
  const changed = (input.status && input.status !== f.status) || (input.adminReply !== undefined && (input.adminReply.trim() || null) !== f.adminReply) || (input.recognize && !f.recognized);
  if (changed) {
    await notifyUsers([f.userId], {
      kind: "FEEDBACK",
      title: input.recognize && !f.recognized ? `Thank you — your feedback "${f.title}" improved the system` : `Your feedback "${f.title}": ${STATUSES[updated.status][0]}`,
      body: updated.adminReply || (input.recognize ? "You have been given the System Improver badge." : ""),
      href: "/feedback", exceptId: owner.id,
    });
  }
  return { feedback: updated };
}

/** People whose feedback was recognised, most first (shown to everyone as thanks). */
export async function contributors(limit = 12) {
  try {
    const rows = await prisma.systemFeedback.groupBy({ by: ["userId"], where: { recognized: true }, _count: { _all: true }, orderBy: { _count: { userId: "desc" } }, take: limit });
    const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ name: names.get(r.userId) || "A user", count: r._count._all }));
  } catch { return []; }
}
