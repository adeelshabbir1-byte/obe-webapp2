import { prisma } from "./db";

// Moodle link (web services REST): the institute's Moodle URL and a web-service token (Moodle → Site administration →
// Server → Web services; functions core_enrol_get_enrolled_users and gradereport_user_get_grade_items). Grades are pulled
// per course and shown in the same column-matching step as an uploaded gradebook, so nothing is saved without a look.
// Google Classroom / Canvas: use their CSV export (same import).

const mdb = prisma as unknown as Record<string, any>;
export const LMS_HINT = "The Moodle link needs prisma/migration_batch5.sql — run it in Supabase.";

export async function lmsConfig(cid: string) {
  // Teaching tools (lib/teachingTools.ts) keep the token encrypted; the older Moodle link is the fallback.
  const t = await mdb.teachingTool?.findUnique({ where: { chairmanId_tool: { chairmanId: cid, tool: "MOODLE" } } }).catch(() => null);
  if (t) {
    const { open } = await import("./secretBox");
    const plain = JSON.parse(t.configJson || "{}") as { url?: string };
    const tok = open(t.secretBox).token;
    if (plain.url && tok) return { moodleUrl: plain.url, moodleToken: tok };
  }
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

export async function call(cfg: { moodleUrl: string; moodleToken: string }, fn: string, params: Record<string, string | number>) {
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

// ---- Teaching tools (queue item 14): test, enrol, sections per topic, quiz marks per question, forum activity.
type Cfg = { moodleUrl: string; moodleToken: string };
export async function moodleCfg(cid: string): Promise<Cfg> {
  const cfg = await lmsConfig(cid);
  if (!cfg?.moodleUrl || !cfg.moodleToken) throw new Error("Moodle is not connected — the IT Manager adds it under Teaching tools.");
  return { moodleUrl: cfg.moodleUrl, moodleToken: cfg.moodleToken };
}
/** Site name, version and which of the web-service functions OBEHUB uses are missing from the token's service. */
export async function moodleTest(c: Cfg, wanted: string[]) {
  const d = (await call(c, "core_webservice_get_site_info", {})) as { sitename: string; release: string; functions: { name: string }[] };
  const have = new Set((d.functions || []).map((f) => f.name));
  return { site: d.sitename, release: d.release, missing: wanted.filter((f) => !have.has(f)) };
}
const flat = (prefix: string, arr: Record<string, unknown>[]) => Object.fromEntries(arr.flatMap((o, i) => Object.entries(o).map(([k, v]) => [`${prefix}[${i}][${k}]`, v as string | number])));
/** Enrols the class: finds each student by ID number (= roll number), creates missing accounts, enrols as student. */
export async function moodleEnrol(c: Cfg, moodleCourseId: number, students: { roll: string; name: string; email: string | null }[]) {
  const found = new Map<string, number>();
  for (let i = 0; i < students.length; i += 50) {
    const vals = Object.fromEntries(students.slice(i, i + 50).map((s, k) => [`values[${k}]`, s.roll]));
    const us = (await call(c, "core_user_get_users_by_field", { field: "idnumber", ...vals })) as { id: number; idnumber: string }[];
    for (const u of us) found.set(u.idnumber, u.id);
  }
  const missing = students.filter((s) => !found.has(s.roll));
  const creatable = missing.filter((s) => s.email);
  for (let i = 0; i < creatable.length; i += 25) {
    const part = creatable.slice(i, i + 25);
    const made = (await call(c, "core_user_create_users", flat("users", part.map((s) => { const [first, ...rest] = s.name.trim().split(/\s+/); return { username: s.roll.toLowerCase().replace(/[^a-z0-9._-]/g, ""), idnumber: s.roll, firstname: first || s.roll, lastname: rest.join(" ") || "-", email: s.email!, auth: "manual", createpassword: 1 }; })))) as { id: number; username: string }[];
    made.forEach((m, k) => found.set(part[k].roll, m.id));
  }
  const ids = students.map((s) => found.get(s.roll)).filter((x): x is number => !!x);
  for (let i = 0; i < ids.length; i += 100) await call(c, "enrol_manual_enrol_users", flat("enrolments", ids.slice(i, i + 100).map((userid) => ({ roleid: 5, userid, courseid: moodleCourseId }))));
  return { enrolled: ids.length, created: creatable.length, skipped: missing.length - creatable.length };
}
/** One section per lecture topic, in plan order, named "Lecture n — topic". */
export async function moodleSections(c: Cfg, moodleCourseId: number, topics: { n: number; topic: string }[]) {
  const course = ((await call(c, "core_course_get_courses_by_field", { field: "id", value: moodleCourseId })) as { courses: { format: string }[] }).courses?.[0];
  if (!course) throw new Error("Moodle has no course with that id.");
  await call(c, "core_course_update_courses", { "courses[0][id]": moodleCourseId, "courses[0][courseformatoptions][0][name]": "numsections", "courses[0][courseformatoptions][0][value]": topics.length });
  const secs = (await call(c, "core_course_get_contents", { courseid: moodleCourseId, "options[0][name]": "excludemodules", "options[0][value]": 1 })) as { id: number; section: number }[];
  let named = 0;
  for (const t of topics) {
    const s = secs.find((x) => x.section === named + 1); if (!s) break;
    await call(c, "core_update_inplace_editable", { component: `format_${course.format}`, itemtype: "sectionname", itemid: s.id, value: `Lecture ${t.n} — ${t.topic}`.slice(0, 250) });
    named++;
  }
  return { sections: named };
}
/** Every finished quiz attempt, mark per question, as a gradebook CSV ("Quiz name Q3 (Real)"), so CLO results follow
 * the questions once each column is matched to an assessment. Uses each student's best-marked finished attempt. */
export async function moodleQuizQuestions(c: Cfg, moodleCourseId: number) {
  const users = (await call(c, "core_enrol_get_enrolled_users", { courseid: moodleCourseId })) as { id: number; fullname: string; idnumber?: string; username?: string; roles?: { shortname: string }[] }[];
  const learners = users.filter((u) => !u.roles?.length || u.roles.some((r) => r.shortname === "student"));
  const quizzes = ((await call(c, "mod_quiz_get_quizzes_by_courses", { "courseids[0]": moodleCourseId })) as { quizzes: { id: number; name: string }[] }).quizzes || [];
  const cols = new Map<string, { title: string; max: number }>(); const cell = new Map<string, Map<string, number>>();
  let calls = 0;
  for (const q of quizzes) for (const u of learners) {
    if (++calls > 1500) break;
    const at = ((await call(c, "mod_quiz_get_user_attempts", { quizid: q.id, userid: u.id, status: "finished" })) as { attempts: { id: number; sumgrades: number | null }[] }).attempts || [];
    const best = at.sort((a, b) => (b.sumgrades ?? -1) - (a.sumgrades ?? -1))[0]; if (!best) continue;
    const rev = (await call(c, "mod_quiz_get_attempt_review", { attemptid: best.id })) as { questions: { slot: number; mark?: string; maxmark?: number }[] };
    const row = cell.get(String(u.id)) || new Map<string, number>(); cell.set(String(u.id), row);
    for (const qq of rev.questions || []) {
      const k = `${q.id}:${qq.slot}`;
      if (!cols.has(k)) cols.set(k, { title: `${q.name} Q${qq.slot}`, max: Number(qq.maxmark) || 0 });
      const m = Number(String(qq.mark ?? "").replace(",", ".")); if (Number.isFinite(m)) row.set(k, m);
    }
  }
  const keys = Array.from(cols.keys());
  const lines = [["ID number", "Full name", ...keys.map((k) => `${cols.get(k)!.title} (Real)`)].map(csvq).join(","), ["Points", "", ...keys.map((k) => cols.get(k)!.max)].map(csvq).join(",")];
  for (const u of learners) { const key = u.idnumber || u.username || ""; if (!key) continue; const r = cell.get(String(u.id)); lines.push([key, u.fullname, ...keys.map((k) => r?.get(k) ?? "")].map(csvq).join(",")); }
  return { csv: lines.join("\n"), students: learners.length, items: keys.length };
}
/** Posts per forum per teaching week (from the term start), split teacher / students; graded forums marked. */
export async function moodleForums(c: Cfg, moodleCourseId: number, start: Date) {
  const users = (await call(c, "core_enrol_get_enrolled_users", { courseid: moodleCourseId })) as { id: number; roles?: { shortname: string }[] }[];
  const teachers = new Set(users.filter((u) => u.roles?.some((r) => /teacher/.test(r.shortname))).map((u) => u.id));
  const forums = (await call(c, "mod_forum_get_forums_by_courses", { "courseids[0]": moodleCourseId })) as { id: number; name: string; type: string; assessed?: number; grade_forum?: number }[];
  const out: { forumId: string; forumName: string; graded: boolean; week: number; posts: number; teacherPosts: number; students: number }[] = [];
  for (const f of forums.filter((x) => x.type !== "news")) {
    const ds = ((await call(c, "mod_forum_get_forum_discussions", { forumid: f.id, perpage: 200 })) as { discussions: { discussion: number }[] }).discussions || [];
    const byWeek = new Map<number, { posts: number; teacherPosts: number; who: Set<number> }>();
    for (const d of ds.slice(0, 200)) {
      const posts = ((await call(c, "mod_forum_get_discussion_posts", { discussionid: d.discussion })) as { posts: { timecreated: number; author: { id: number } }[] }).posts || [];
      for (const p of posts) {
        const w = Math.max(1, Math.floor((p.timecreated * 1000 - start.getTime()) / (7 * 864e5)) + 1);
        const r = byWeek.get(w) || { posts: 0, teacherPosts: 0, who: new Set<number>() }; byWeek.set(w, r);
        if (teachers.has(p.author.id)) r.teacherPosts++; else { r.posts++; r.who.add(p.author.id); }
      }
    }
    for (const [week, r] of Array.from(byWeek.entries())) out.push({ forumId: String(f.id), forumName: f.name, graded: (f.assessed || 0) > 0 || (f.grade_forum || 0) > 0, week, posts: r.posts, teacherPosts: r.teacherPosts, students: r.who.size });
  }
  return out;
}
