import { prisma } from "./db";
import { createFeedback, updateFeedback } from "./feedback";
import { chairmanIdFor } from "./reportScope";

// "Report a problem" (pilot): the button on every page files a System Feedback row (so the Super Admin's list, the
// reply and the reporter's bell all work as they already do) plus the page, browser, kind and screenshot here.
// The per-institute pilot switch shows the button to everyone, to chosen departments only, or to nobody.

const db = prisma as unknown as Record<string, any>;
export const KINDS: Record<string, { label: string; category: string }> = { BUG: { label: "Bug", category: "PROBLEM" }, CONFUSING: { label: "Confusing", category: "USABILITY" }, MISSING: { label: "Missing feature", category: "IDEA" } };
/** The admin list's words for the feedback statuses. */
export const STATUS_WORD: Record<string, string> = { NEW: "New", UNDER_REVIEW: "Seen", DONE: "Fixed", DECLINED: "Won't fix", PLANNED: "Seen" };
type Who = { id: string; role: string; managedById: string | null; name: string; departmentId?: string | null };

export async function pilotOf(chairmanId: string | null | undefined) {
  if (!chairmanId) return { mode: "ALL", departmentIds: [] as string[] };
  const r = await db.problemPilot?.findUnique({ where: { chairmanId } }).catch(() => null);
  return { mode: (r?.mode as string) || "ALL", departmentIds: r ? (JSON.parse(r.departmentIdsJson || "[]") as string[]) : [] };
}
/** Is the button shown to this person? (Default: everyone, for the pilot.) */
export async function showButton(user: Who) {
  if (user.role === "SUPER_USER") return true;
  const cid = await chairmanIdFor(user as never).catch(() => null);
  const p = await pilotOf(cid);
  if (p.mode === "OFF") return false;
  if (p.mode === "DEPARTMENTS") return !!user.departmentId && p.departmentIds.includes(user.departmentId);
  return true;
}
export async function setPilot(chairmanId: string, mode: string, departmentIds: string[], by: string) {
  const m = ["ALL", "DEPARTMENTS", "OFF"].includes(mode) ? mode : "ALL";
  await db.problemPilot.upsert({ where: { chairmanId }, create: { chairmanId, mode: m, departmentIdsJson: JSON.stringify(departmentIds), updatedById: by }, update: { mode: m, departmentIdsJson: JSON.stringify(departmentIds), updatedById: by, updatedAt: new Date() } });
}

/** Files a report: the page, user, role, browser, time, the person's note and kind, and the screenshot. */
export async function fileReport(user: Who, b: { note: string; kind: string; url: string; browser: string; screenshot?: string | null }) {
  if (!(await showButton(user))) throw new Error("Reporting is not switched on for your department.");
  const kind = KINDS[b.kind] ? b.kind : "BUG";
  const url = String(b.url || "/").replace(/^https?:\/\/[^/]+/, "").slice(0, 300) || "/";
  const note = String(b.note || "").trim();
  if (note.length < 3) throw new Error("Add a short note: what happened, or what you expected.");
  const r = await createFeedback(user, { category: KINDS[kind].category, title: `${KINDS[kind].label}: ${url}`.slice(0, 160), body: note.length >= 10 ? note : `${note} (reported on ${url})`, pageUrl: url.split("#")[0] });
  if ("error" in r) throw new Error(r.error);
  let ref: string | null = null;
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(String(b.screenshot || ""));
  if (m) {
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 6_000_000) throw new Error("The screenshot is too big (6 MB at most).");
    try { const { storePrivate } = await import("./sampleStorage"); ref = await storePrivate(buf, `screenshot.${m[2] === "jpeg" ? "jpg" : m[2]}`, m[1], "problem-reports"); }
    catch { ref = buf.length <= 1_500_000 ? `data:${m[1]};base64,${m[3]}` : null; }
  }
  await db.problemReport.create({ data: { feedbackId: r.feedback.id, chairmanId: r.feedback.chairmanId, userId: user.id, role: user.role, departmentId: user.departmentId || null, kind, pageUrl: url, browser: String(b.browser || "").slice(0, 300), screenshotRef: ref } });
  return { id: r.feedback.id };
}

export type ReportRow = { id: string; createdAt: Date; status: string; kind: string; role: string; page: string; note: string; reply: string | null; user: string; institute: string; browser: string | null; hasShot: boolean };
export async function listReports(f: { status?: string; role?: string; page?: string; kind?: string } = {}) {
  const meta = (await db.problemReport.findMany({ where: { ...(f.role ? { role: f.role } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(f.page ? { pageUrl: { contains: f.page } } : {}) }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => [])) as { feedbackId: string; chairmanId: string | null; userId: string; role: string; kind: string; pageUrl: string; browser: string | null; screenshotRef: string | null; createdAt: Date }[];
  const fb = await prisma.systemFeedback.findMany({ where: { id: { in: meta.map((m) => m.feedbackId).concat("none") }, ...(f.status ? { status: f.status } : {}) } });
  const people = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(meta.flatMap((m) => [m.userId, m.chairmanId || ""]))) } }, select: { id: true, name: true, instituteName: true } })).map((u) => [u.id, u]));
  const byId = new Map(fb.map((x) => [x.id, x]));
  return meta.filter((m) => byId.has(m.feedbackId)).map((m): ReportRow => { const x = byId.get(m.feedbackId)!; return { id: m.feedbackId, createdAt: m.createdAt, status: x.status, kind: m.kind, role: m.role, page: m.pageUrl, note: x.body, reply: x.adminReply, user: people.get(m.userId)?.name || "—", institute: people.get(m.chairmanId || "")?.instituteName || people.get(m.chairmanId || "")?.name || "—", browser: m.browser, hasShot: !!m.screenshotRef }; });
}
export async function screenshotOf(feedbackId: string) {
  const m = await db.problemReport.findUnique({ where: { feedbackId } }).catch(() => null);
  if (!m?.screenshotRef) return null;
  const { readStored } = await import("./sampleStorage");
  return readStored(m.screenshotRef);
}
/** Status (New / Seen / Fixed / Won't fix) and a reply — the reporter hears it in the bell. */
export const answerReport = (owner: { id: string }, id: string, status: string, reply: string) => updateFeedback(owner, id, { status, adminReply: reply });
