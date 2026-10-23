import { prisma } from "./db";

// Moodle link (web services REST): the institute's Moodle URL and a web-service token (Moodle → Site administration →
// Server → Web services; functions core_enrol_get_enrolled_users and gradereport_user_get_grade_items). Grades are pulled
// per course and shown in the same column-matching step as an uploaded gradebook, so nothing is saved without a look.
// Google Classroom / Canvas: use their CSV export (same import).

const mdb = prisma as unknown as Record<string, any>;
export const LMS_HINT = "The Moodle link needs prisma/migration_batch5.sql — run it in Supabase.";

export async function lmsConfig(cid: string) {
  return (await mdb.lmsConfig.findUnique({ where: { chairmanId: cid } }).catch(() => null)) as { moodleUrl: string | null; moodleToken: string | null } | null;
}
export async function saveLmsConfig(cid: string, url: string, token: string) {
  const u = url.trim().replace(/\/+$/, "");
  if (u && !/^https:\/\//.test(u)) throw new Error("The Moodle address must start with https://");
  const data: Record<string, unknown> = { moodleUrl: u || null, updatedAt: new Date() };
  if (token.trim()) data.moodleToken = token.trim();
  await mdb.lmsConfig.upsert({ where: { chairmanId: cid }, create: { chairmanId: cid, ...data }, update: data });
}
export async function courseLink(courseId: string) {
  return (await mdb.lmsCourseLink.findUnique({ where: { courseId } }).catch(() => null)) as { moodleCourseId: number; lastSyncAt: Date | null } | null;
}

async function call(cfg: { moodleUrl: string; moodleToken: string }, fn: string, params: Record<string, string | number>) {
  const q = new URLSearchParams({ wstoken: cfg.moodleToken, wsfunction: fn, moodlewsrestformat: "json", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const r = await fetch(`${cfg.moodleUrl}/webservice/rest/server.php`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q.toString(), signal: AbortSignal.timeout(20000) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error(`Moodle did not answer (${r.status}).`);
  if (d.exception) throw new Error(`Moodle: ${d.message || d.errorcode}`);
  return d;
}

const csvq = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

/** Grades of one Moodle course as a gradebook CSV (ID number, name, one column per grade item, a Points row). */
export async function moodleGradebook(cid: string, courseId: string, moodleCourseId: number) {
  const cfg = await lmsConfig(cid);
  if (!cfg?.moodleUrl || !cfg.moodleToken) throw new Error("Moodle is not linked yet — the Institute Head adds its address and token under Moodle link.");
  const c = { moodleUrl: cfg.moodleUrl, moodleToken: cfg.moodleToken };
  const users = (await call(c, "core_enrol_get_enrolled_users", { courseid: moodleCourseId })) as { id: number; fullname: string; idnumber?: string; username?: string; email?: string }[];
  const rep = (await call(c, "gradereport_user_get_grade_items", { courseid: moodleCourseId })) as { usergrades: { userid: number; gradeitems: { id: number; itemname: string | null; itemtype: string; graderaw: number | null; grademax: number }[] }[] };
  const byUser = new Map(users.map((u) => [u.id, u]));
  const items = new Map<number, { name: string; max: number }>();
  for (const ug of rep.usergrades || []) for (const g of ug.gradeitems) if (g.itemtype !== "course" && g.itemtype !== "category" && g.itemname) items.set(g.id, { name: g.itemname, max: g.grademax });
  const ids = Array.from(items.keys());
  const lines = [["ID number", "Full name", ...ids.map((i) => `${items.get(i)!.name} (Real)`)].map(csvq).join(","), ["Points", "", ...ids.map((i) => items.get(i)!.max)].map(csvq).join(",")];
  for (const ug of rep.usergrades || []) {
    const u = byUser.get(ug.userid);
    const key = u?.idnumber || u?.username || u?.email || "";
    if (!key) continue;
    const g = new Map(ug.gradeitems.map((x) => [x.id, x.graderaw]));
    lines.push([key, u?.fullname || "", ...ids.map((i) => (g.get(i) ?? ""))].map(csvq).join(","));
  }
  await mdb.lmsCourseLink.upsert({ where: { courseId }, create: { courseId, moodleCourseId, lastSyncAt: new Date() }, update: { moodleCourseId, lastSyncAt: new Date() } });
  return { csv: lines.join("\n"), students: lines.length - 2, items: ids.length };
}
