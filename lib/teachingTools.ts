import { randomUUID } from "crypto";
import { prisma } from "./db";
import { open, seal } from "./secretBox";
import { writeAuditLog } from "./audit";
import { emailFor, splitConfig, TOOLS, SCOPES, youtubeId, MAX_VIDEO_MIN, weeklyEvidence, creditCheck, type Tool, type Facts, type Mode } from "./teachingToolsCore";
import * as C from "./toolClients";
import * as M from "./moodle";

// Queue item 14: each institute connects its teaching tools once (the IT Manager, or the Institute Head until one is
// named). Courses then link to their class in each tool; OBEHUB keeps the OBE record and pulls the evidence back.
const db = prisma as unknown as Record<string, any>;
export const TOOLS_HINT = "Run prisma/migration_adeel_p12.sql (System Health → database updates) first.";
type Row = { chairmanId: string; tool: string; configJson: string; secretBox: string | null; status: string; lastCheckAt: Date | null; lastError: string | null; checkJson: string | null; updatedAt: Date };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export async function toolsOf(cid: string) {
  const rows = ((await db.teachingTool?.findMany({ where: { chairmanId: cid } }).catch(() => null)) || null) as Row[] | null;
  if (!rows) return null;
  return (Object.keys(TOOLS) as Tool[]).map((tool) => {
    const r = rows.find((x) => x.tool === tool);
    const secretKeys = Object.keys(open(r?.secretBox));
    return { tool, saved: !!r, plain: J<Record<string, string>>(r?.configJson, {}), secretSet: secretKeys, status: r?.status || "NEW", lastCheckAt: r?.lastCheckAt || null, lastError: r?.lastError || null, checks: J<C.Check[]>(r?.checkJson, []) };
  });
}
async function cfg(cid: string, tool: Tool) {
  const r = (await db.teachingTool.findUnique({ where: { chairmanId_tool: { chairmanId: cid, tool } } }).catch(() => null)) as Row | null;
  if (!r) throw new Error(`${TOOLS[tool].label} is not connected — the IT Manager adds it under Teaching tools.`);
  return { ...J<Record<string, string>>(r.configJson, {}), ...open(r.secretBox) };
}
export async function connected(cid: string): Promise<Tool[]> {
  const rows = ((await db.teachingTool?.findMany({ where: { chairmanId: cid, status: "OK" }, select: { tool: true } }).catch(() => [])) || []) as { tool: Tool }[];
  return rows.map((r) => r.tool);
}

export async function saveTool(user: { id: string }, cid: string, tool: Tool, form: Record<string, unknown>) {
  const { plain, secret } = splitConfig(tool, form);
  const cur = (await db.teachingTool.findUnique({ where: { chairmanId_tool: { chairmanId: cid, tool } } }).catch(() => null)) as Row | null;
  const box = seal({ ...open(cur?.secretBox), ...secret });
  await db.teachingTool.upsert({ where: { chairmanId_tool: { chairmanId: cid, tool } }, create: { chairmanId: cid, tool, configJson: JSON.stringify(plain), secretBox: box, updatedById: user.id }, update: { configJson: JSON.stringify(plain), secretBox: box, updatedById: user.id, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "TEACHING_TOOL_SAVED", entityType: "TeachingTool", entityId: `${cid}:${tool}`, metadata: { tool, fields: Object.keys(plain).join(","), secretsChanged: Object.keys(secret).join(",") } });
  return testTool(cid, tool);
}
export async function removeTool(user: { id: string }, cid: string, tool: Tool) {
  await db.teachingTool.deleteMany({ where: { chairmanId: cid, tool } });
  await writeAuditLog({ actorUserId: user.id, action: "TEACHING_TOOL_REMOVED", entityType: "TeachingTool", entityId: `${cid}:${tool}`, metadata: { tool } });
}
/** Checks the connection end to end and stores the result (shown on Teaching tools and in System Health). */
export async function testTool(cid: string, tool: Tool) {
  let checks: C.Check[] = [];
  try {
    const c = await cfg(cid, tool);
    if (tool === "MOODLE") {
      const r = await M.moodleTest({ moodleUrl: c.url, moodleToken: c.token }, SCOPES.MOODLE);
      checks = [{ name: "Moodle site", ok: true, note: `${r.site} (Moodle ${r.release})` }, { name: "Web-service functions", ok: !r.missing.length, note: r.missing.length ? `add to the service: ${r.missing.join(", ")}` : "all present" }];
    } else if (tool === "GOOGLE") checks = await C.googleTest(c);
    else if (tool === "MICROSOFT") checks = await C.msTest(c);
    else checks = await C.youtubeTest(c);
  } catch (e) { checks = [{ name: "Connection", ok: false, note: (e as Error).message }]; }
  // Teams for Education permissions are optional: only classes and assignments need them.
  const ok = checks.filter((x) => !(tool === "MICROSOFT" && x.name.startsWith("Edu"))).every((x) => x.ok);
  const bad = checks.filter((x) => !x.ok).map((x) => `${x.name}: ${x.note}`).join("; ");
  await db.teachingTool.update({ where: { chairmanId_tool: { chairmanId: cid, tool } }, data: { status: ok ? "OK" : "FAILING", lastCheckAt: new Date(), lastError: ok ? null : bad.slice(0, 900), checkJson: JSON.stringify(checks) } }).catch(() => null);
  return { ok, checks };
}
/** Every institute's connections, for System Health. */
export async function toolsHealth() {
  const rows = ((await db.teachingTool?.findMany({ select: { chairmanId: true, tool: true, status: true, lastCheckAt: true, lastError: true } }).catch(() => null)) || null) as Row[] | null;
  if (!rows) return null;
  const heads = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.chairmanId))) } }, select: { id: true, name: true, organization: true } });
  return rows.map((r) => ({ ...r, institute: heads.find((h) => h.id === r.chairmanId)?.organization || heads.find((h) => h.id === r.chairmanId)?.name || r.chairmanId }));
}

// ---------------- One course and its class in each tool ----------------
export type CourseCtx = { id: string; code: string; title: string; instructorId: string | null; subjectExpertId: string | null; chairmanId: string; teacherEmail: string | null };
export async function courseCtx(courseId: string): Promise<CourseCtx | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, instructorId: true, subjectExpertId: true, coordinator: { select: { id: true, managedById: true } } } });
  if (!c) return null;
  const t = c.instructorId ? await prisma.user.findUnique({ where: { id: c.instructorId }, select: { email: true } }) : null;
  return { id: c.id, code: c.code, title: c.title, instructorId: c.instructorId, subjectExpertId: c.subjectExpertId, chairmanId: c.coordinator.managedById || c.coordinator.id, teacherEmail: t?.email || null };
}
export async function linksOf(courseId: string) {
  return ((await db.courseToolLink?.findMany({ where: { courseId } }).catch(() => [])) || []) as { tool: Tool; externalId: string; extraJson: string; lastSyncAt: Date | null; lastSyncNote: string | null }[];
}
async function linkOf(courseId: string, tool: Tool) {
  const l = (await db.courseToolLink.findUnique({ where: { courseId_tool: { courseId, tool } } }).catch(() => null)) as { externalId: string } | null;
  if (!l) throw new Error(`Link this course to its ${TOOLS[tool].label} class first.`);
  return l.externalId;
}
const note = (courseId: string, tool: Tool, text: string) => db.courseToolLink.updateMany({ where: { courseId, tool }, data: { lastSyncAt: new Date(), lastSyncNote: text.slice(0, 300) } }).catch(() => null);
export async function linkCourse(courseId: string, tool: Tool, externalId: string) {
  const id = externalId.trim();
  if (!id) { await db.courseToolLink.deleteMany({ where: { courseId, tool } }); return; }
  if (tool === "MOODLE" && !/^\d+$/.test(id)) throw new Error("Enter the Moodle course id (the number in …/course/view.php?id=…).");
  await db.courseToolLink.upsert({ where: { courseId_tool: { courseId, tool } }, create: { courseId, tool, externalId: id }, update: { externalId: id } });
  if (tool === "MOODLE") await db.lmsCourseLink?.upsert({ where: { courseId }, create: { courseId, moodleCourseId: Number(id) }, update: { moodleCourseId: Number(id) } }).catch(() => null);
}
/** The teacher's classes in Google Classroom / Teams for Education, to pick from. */
export async function classChoices(ctx: CourseCtx, tool: Tool) {
  if (!ctx.teacherEmail) throw new Error("The teacher has no email address in OBEHUB.");
  const c = await cfg(ctx.chairmanId, tool);
  if (tool === "GOOGLE") return C.googleCourses(c, ctx.teacherEmail);
  if (tool === "MICROSOFT") return C.msClasses(c, ctx.teacherEmail);
  return [];
}
async function enrolled(courseId: string) {
  return (await prisma.studentEnrollment.findMany({ where: { courseId }, select: { student: { select: { rollNumber: true, name: true } } } })).map((e) => e.student);
}
const local = (e: string) => e.toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9]/g, "");

/** OBEHUB's class list against the tool's: who is missing on either side; Moodle enrols, Classroom invites. */
export async function syncRoster(ctx: CourseCtx, tool: Tool, apply: boolean) {
  const c = await cfg(ctx.chairmanId, tool); const ext = await linkOf(ctx.id, tool);
  const ours = await enrolled(ctx.id);
  if (tool === "MOODLE") {
    if (!apply) throw new Error("Use Enrol the class for Moodle.");
    const pattern = (await cfg(ctx.chairmanId, "GOOGLE").catch(() => null))?.studentEmail || (await cfg(ctx.chairmanId, "MICROSOFT").catch(() => null))?.studentEmail;
    const r = await M.moodleEnrol({ moodleUrl: c.url, moodleToken: c.token }, Number(ext), ours.map((s) => ({ roll: s.rollNumber, name: s.name, email: emailFor(pattern, s.rollNumber) })));
    const msg = `Enrolled ${r.enrolled} in Moodle${r.created ? ` (${r.created} new accounts)` : ""}${r.skipped ? `; ${r.skipped} have no Moodle account and no email pattern to create one` : ""}.`;
    await note(ctx.id, tool, msg); return { message: msg };
  }
  const theirs = tool === "GOOGLE" ? await C.googleRoster(c, ctx.teacherEmail!, ext) : await C.msRoster(c, ext);
  const have = new Set(theirs.map((t) => local(t.email)));
  const missing = ours.filter((s) => !have.has(s.rollNumber.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const oursSet = new Set(ours.map((s) => s.rollNumber.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const extra = theirs.filter((t) => !oursSet.has(local(t.email)));
  let invited = 0;
  if (apply && tool === "GOOGLE" && missing.length) {
    for (const s of missing.slice(0, 300)) { const e = emailFor(c.studentEmail, s.rollNumber); if (!e) break; await C.googleInvite(c, ctx.teacherEmail!, ext, e).then(() => invited++).catch(() => null); }
  }
  const msg = `${ours.length - missing.length} of ${ours.length} students are in the ${TOOLS[tool].label} class${missing.length ? `; missing: ${missing.slice(0, 8).map((s) => s.rollNumber).join(", ")}${missing.length > 8 ? "…" : ""}` : ""}${invited ? `; invited ${invited}` : ""}${extra.length ? `; ${extra.length} in the class are not enrolled in OBEHUB` : ""}.`;
  await note(ctx.id, tool, msg);
  return { message: msg, missing: missing.map((s) => s.rollNumber), extra: extra.map((t) => t.email) };
}
export async function moodleSectionsFor(ctx: CourseCtx) {
  const c = await cfg(ctx.chairmanId, "MOODLE"); const ext = await linkOf(ctx.id, "MOODLE");
  const rows = await prisma.lectureRow.findMany({ where: { courseId: ctx.id, source: "INSTRUCTOR" }, select: { lectureNumber: true, topic: true }, orderBy: { lectureNumber: "asc" } });
  const base = rows.length ? rows : await prisma.lectureRow.findMany({ where: { courseId: ctx.id, source: "SE" }, select: { lectureNumber: true, topic: true }, orderBy: { lectureNumber: "asc" } });
  const r = await M.moodleSections({ moodleUrl: c.url, moodleToken: c.token }, Number(ext), base.map((x) => ({ n: x.lectureNumber, topic: x.topic })));
  const msg = `Moodle now has ${r.sections} sections, one per lecture topic.`; await note(ctx.id, "MOODLE", msg); return { message: msg };
}
/** Posts one of the course's assessments as Classroom coursework or a Teams assignment, linked back to OBEHUB. */
export async function postInstrument(ctx: CourseCtx, tool: Tool, instrumentId: string, origin: string) {
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId } });
  if (!inst || inst.courseId !== ctx.id) throw new Error("Choose one of this course's assessments.");
  const quiz = await db.onlineQuiz.findFirst({ where: { courseId: ctx.id, instrumentId, status: "PUBLISHED" }, select: { id: true, closesAt: true } }).catch(() => null);
  const c = await cfg(ctx.chairmanId, tool); const ext = await linkOf(ctx.id, tool);
  const w = { title: `${ctx.code} — ${inst.label}`, description: `${inst.type} for ${ctx.code} ${ctx.title}, out of ${inst.maxScore}.`, maxPoints: inst.maxScore, due: quiz?.closesAt || null, link: quiz ? `${origin}/student/quizzes/${quiz.id}` : `${origin}/student/submissions`, quiz: !!quiz };
  const r = tool === "GOOGLE" ? await C.googlePost(c, ctx.teacherEmail!, ext, w) : tool === "MICROSOFT" ? await C.msPost(c, ext, w) : null;
  if (!r) throw new Error("Posting is for Google Classroom and Teams.");
  const msg = `Posted ${inst.label} to ${TOOLS[tool].label}.`; await note(ctx.id, tool, msg);
  return { message: msg, link: r.link };
}
/** The tool's grades as a gradebook CSV for the import step (nothing is saved until the teacher matches the columns). */
export async function gradesCsv(ctx: CourseCtx, tool: Tool, perQuestion = false) {
  const c = await cfg(ctx.chairmanId, tool); const ext = await linkOf(ctx.id, tool);
  if (tool === "MOODLE") return perQuestion ? M.moodleQuizQuestions({ moodleUrl: c.url, moodleToken: c.token }, Number(ext)) : M.moodleGradebook(ctx.chairmanId, ctx.id, Number(ext));
  if (tool === "GOOGLE") return C.googleGrades(c, ctx.teacherEmail!, ext);
  if (tool === "MICROSOFT") return C.msGrades(c, ext);
  throw new Error("YouTube has no grades.");
}

// ---------------- Live lectures: a Meet / Teams meeting per live lecture, then attendance and recording ----------------
const TZ = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 300);
async function liveLectures(ctx: CourseCtx, all: boolean) {
  const { allStored } = await import("./scopedSettings");
  const stored = await allStored(ctx.chairmanId).catch(() => []);
  const modes = J<Record<string, string>>(stored.find((r) => r.key === `odl.modes.${ctx.id}`)?.value, {});
  const rows = await prisma.lectureRow.findMany({ where: { courseId: ctx.id, source: "INSTRUCTOR" }, select: { lectureNumber: true, topic: true, actualDate: true }, orderBy: { lectureNumber: "asc" } });
  return rows.filter((r) => all || modes[String(r.lectureNumber)] === "LIVE");
}
async function slotFor(courseId: string) {
  const sec = await prisma.scheduleSection.findFirst({ where: { courseId }, select: { sessionDurationMinutes: true, timetableEntries: { select: { dayOfWeek: true, startHour: true, timetableRun: { select: { status: true, createdAt: true } } } } } });
  const entries = (sec?.timetableEntries || []).filter((e) => e.timetableRun.status === "COMPLETED");
  return { minutes: sec?.sessionDurationMinutes || 60, entries };
}
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export async function scheduleLive(user: { id: string }, ctx: CourseCtx, tool: Tool, all: boolean) {
  if (tool !== "GOOGLE" && tool !== "MICROSOFT") throw new Error("Live lectures use Google Meet or Teams.");
  if (!ctx.teacherEmail) throw new Error("The teacher has no email address in OBEHUB.");
  const c = await cfg(ctx.chairmanId, tool);
  const lectures = await liveLectures(ctx, all);
  if (!lectures.length) return { message: all ? "The lecture log has no lectures yet." : "No lecture is marked Live online — set the delivery mode of each lecture in the ODL plan, or choose all lectures." };
  const slot = await slotFor(ctx.id);
  const have = new Set(((await db.liveSession.findMany({ where: { courseId: ctx.id }, select: { lectureNumber: true } })) as { lectureNumber: number }[]).map((x) => x.lectureNumber));
  const attendees = tool === "GOOGLE" ? (await enrolled(ctx.id)).map((s) => emailFor(c.studentEmail, s.rollNumber)).filter((x): x is string => !!x) : [];
  let made = 0, undated = 0; const errors: string[] = [];
  for (const l of lectures) {
    if (have.has(l.lectureNumber)) continue;
    if (!l.actualDate) { undated++; continue; }
    if (l.actualDate.getTime() < Date.now() - 864e5) continue;
    const d = new Date(l.actualDate); const day = DAYS[new Date(d.getTime() + TZ * 60000).getUTCDay()];
    const e = slot.entries.find((x) => x.dayOfWeek === day) || slot.entries[0];
    const ymd = new Date(d.getTime() + TZ * 60000);
    const start = new Date(Date.UTC(ymd.getUTCFullYear(), ymd.getUTCMonth(), ymd.getUTCDate()) + (e ? e.startHour : 9) * 3600e3 - TZ * 60000);
    const end = new Date(start.getTime() + slot.minutes * 60000);
    const title = `${ctx.code} Lecture ${l.lectureNumber}: ${l.topic}`.slice(0, 200);
    try {
      const m = tool === "GOOGLE" ? await C.googleMeet(c, ctx.teacherEmail, { summary: title, description: `${ctx.title} — live lecture (OBEHUB)`, start, end, attendees }) : await C.msMeeting(c, ctx.teacherEmail, { subject: title, start, end });
      await db.liveSession.create({ data: { id: randomUUID(), courseId: ctx.id, lectureNumber: l.lectureNumber, tool, startsAt: start, endsAt: end, joinUrl: m.joinUrl, externalId: tool === "GOOGLE" ? (m as unknown as { code: string }).code : m.id, organizer: ctx.teacherEmail, createdById: user.id } });
      made++;
    } catch (err) { errors.push((err as Error).message); if (errors.length > 2) break; }
  }
  const msg = `Made ${made} ${tool === "GOOGLE" ? "Meet" : "Teams"} meeting(s)${undated ? `; ${undated} live lecture(s) have no date in the lecture log yet` : ""}${errors.length ? `; stopped: ${errors[0]}` : ""}.`;
  await note(ctx.id, tool, msg);
  return { message: msg };
}
export type Session = { id: string; courseId: string; lectureNumber: number; tool: string; startsAt: Date; endsAt: Date; joinUrl: string | null; externalId: string | null; organizer: string | null; recordingUrl: string | null; attendees: number | null; attendanceJson: string | null; heldMinutes: number | null; status: string; syncNote: string | null };
export async function sessionsOf(courseId: string) { return ((await db.liveSession?.findMany({ where: { courseId }, orderBy: { startsAt: "asc" } }).catch(() => [])) || []) as Session[]; }
/** Reads attendance and the recording of finished meetings back from Meet / Teams. */
export async function syncSessions(ctx: CourseCtx, onlyIds?: string[]) {
  const ss = (await sessionsOf(ctx.id)).filter((s) => s.endsAt.getTime() < Date.now() && (!onlyIds || onlyIds.includes(s.id)) && s.externalId && s.organizer && (s.status !== "HELD" || !s.recordingUrl));
  let n = 0;
  for (const s of ss.slice(0, 40)) {
    try {
      const c = await cfg(ctx.chairmanId, s.tool as Tool);
      const a = s.tool === "GOOGLE" ? await C.googleMeetArtifacts(c, s.organizer!, s.externalId!) : await C.msArtifacts(c, s.organizer!, s.externalId!);
      if (!a) { await db.liveSession.update({ where: { id: s.id }, data: { syncedAt: new Date(), syncNote: "no meeting record yet" } }); continue; }
      const people = a.attendance.filter((p) => p.name && !(s.organizer && p.name.toLowerCase() === s.organizer.toLowerCase()));
      await db.liveSession.update({ where: { id: s.id }, data: { status: "HELD", heldMinutes: a.heldMinutes, attendees: people.length, attendanceJson: JSON.stringify(people).slice(0, 60000), recordingUrl: a.recordingUrl || s.recordingUrl, syncedAt: new Date(), syncNote: null } });
      n++;
    } catch (e) { await db.liveSession.update({ where: { id: s.id }, data: { syncedAt: new Date(), syncNote: (e as Error).message.slice(0, 300) } }).catch(() => null); }
  }
  return { message: `Updated ${n} of ${ss.length} finished meeting(s).` };
}
export async function markSession(courseId: string, id: string, d: { status?: string; recordingUrl?: string; attendees?: number | null }) {
  const data: Record<string, unknown> = {};
  if (d.status && ["PLANNED", "HELD", "NOT_HELD"].includes(d.status)) data.status = d.status;
  if (d.recordingUrl !== undefined) { const u = d.recordingUrl.trim(); if (u && !/^https:\/\//.test(u)) throw new Error("The recording link must start with https://"); data.recordingUrl = u || null; }
  if (d.attendees !== undefined) data.attendees = d.attendees == null ? null : Math.max(0, Math.round(d.attendees));
  await db.liveSession.updateMany({ where: { id, courseId }, data });
}
/** Daily: attendance and recordings of meetings that ended in the last three days, in every institute. */
export async function syncRecentSessions() {
  const recent = ((await db.liveSession?.findMany({ where: { endsAt: { gte: new Date(Date.now() - 3 * 864e5), lte: new Date() }, OR: [{ status: "PLANNED" }, { recordingUrl: null }] }, select: { courseId: true } }).catch(() => [])) || []) as { courseId: string }[];
  let n = 0;
  for (const courseId of Array.from(new Set(recent.map((r) => r.courseId)))) { const ctx = await courseCtx(courseId); if (ctx) { await syncSessions(ctx).catch(() => null); n++; } }
  return n;
}

// ---------------- Discussion boards (Moodle) ----------------
export async function syncForums(ctx: CourseCtx) {
  const c = await cfg(ctx.chairmanId, "MOODLE"); const ext = await linkOf(ctx.id, "MOODLE");
  const start = await termStart(ctx.id);
  const rows = await M.moodleForums({ moodleUrl: c.url, moodleToken: c.token }, Number(ext), start);
  for (const r of rows) await db.discussionActivity.upsert({ where: { courseId_tool_forumId_week: { courseId: ctx.id, tool: "MOODLE", forumId: r.forumId, week: r.week } }, create: { courseId: ctx.id, tool: "MOODLE", ...r }, update: { forumName: r.forumName, graded: r.graded, posts: r.posts, teacherPosts: r.teacherPosts, students: r.students, syncedAt: new Date() } });
  const msg = `Read ${rows.length} forum-week(s) from Moodle.`; await note(ctx.id, "MOODLE", msg); return { message: msg };
}
export async function forumsOf(courseId: string) { return ((await db.discussionActivity?.findMany({ where: { courseId }, orderBy: [{ week: "asc" }, { forumName: "asc" }] }).catch(() => [])) || []) as { tool: string; forumId: string; week: number; forumName: string; graded: boolean; posts: number; teacherPosts: number; students: number; hours: number | null }[]; }
export async function setForumHours(courseId: string, forumId: string, week: number, hours: number | null, graded?: boolean) {
  await db.discussionActivity.updateMany({ where: { courseId, forumId, week }, data: { hours: hours == null || !Number.isFinite(hours) ? null : Math.max(0, hours), ...(graded === undefined ? {} : { graded }) } });
}
export async function termStart(courseId: string) {
  const first = await prisma.lectureRow.findFirst({ where: { courseId, source: "INSTRUCTOR", actualDate: { not: null } }, orderBy: { actualDate: "asc" }, select: { actualDate: true } });
  if (first?.actualDate) return first.actualDate;
  const s = await db.liveSession?.findFirst({ where: { courseId }, orderBy: { startsAt: "asc" }, select: { startsAt: true } }).catch(() => null);
  return (s?.startsAt as Date) || new Date(Date.now() - 7 * 864e5);
}

// ---------------- ODL content modules per lecture topic (7.iv–7.vi) ----------------
export type Module = { id: string; courseId: string; lectureNumber: number; videoUrl: string | null; videoId: string | null; videoTitle: string | null; videoMin: number | null; captions: boolean; selfQ: number; readingUrl: string | null; readingMin: number | null; refs: string | null; interaction: string | null };
export async function modulesOf(courseId: string) {
  const [rows, mods, review] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { lectureNumber: true, week: true, topic: true, clo: { select: { code: true } } }, orderBy: { lectureNumber: "asc" } }),
    (db.odlModule?.findMany({ where: { courseId } }).catch(() => null) || Promise.resolve(null)) as Promise<Module[] | null>,
    db.odlContentReview?.findUnique({ where: { courseId } }).catch(() => null) as Promise<{ seName: string | null; seAt: Date | null; idName: string | null; idAt: Date | null; notes: string | null } | null>,
  ]);
  if (!mods) return null;
  const by = new Map(mods.map((m) => [m.lectureNumber, m]));
  return { lectures: rows.map((r) => ({ n: r.lectureNumber, week: r.week, topic: r.topic, clo: r.clo?.code || null, m: by.get(r.lectureNumber) || null })), review };
}
export async function saveModule(user: { id: string }, ctx: CourseCtx, n: number, d: Record<string, unknown>) {
  const s = (k: string) => { const v = String(d[k] ?? "").trim(); return v || null; };
  const url = (k: string) => { const v = s(k); if (v && !/^https:\/\//.test(v)) throw new Error("Links must start with https://"); return v; };
  const videoUrl = url("videoUrl"), vid = videoUrl ? youtubeId(videoUrl) : null;
  const data = { videoUrl, videoId: vid, videoMin: d.videoMin === "" || d.videoMin == null ? null : Math.max(0, Number(d.videoMin)) || null, captions: !!d.captions, selfQ: Math.max(0, Math.round(Number(d.selfQ) || 0)), readingUrl: url("readingUrl"), readingMin: d.readingMin === "" || d.readingMin == null ? null : Math.max(0, Math.round(Number(d.readingMin))) || null, refs: s("refs"), interaction: s("interaction"), updatedById: user.id, updatedAt: new Date() };
  if (vid) { // YouTube length and title when the institute has connected YouTube
    const yt = await cfg(ctx.chairmanId, "YOUTUBE").catch(() => null);
    if (yt?.apiKey) { const v = (await C.youtubeVideos(yt, [vid]).catch(() => null))?.get(vid); if (v) Object.assign(data, { videoTitle: v.title, videoMin: v.minutes ?? data.videoMin, captions: v.captions || data.captions }); }
  }
  await db.odlModule.upsert({ where: { courseId_lectureNumber: { courseId: ctx.id, lectureNumber: n } }, create: { id: randomUUID(), courseId: ctx.id, lectureNumber: n, ...data }, update: data });
  // Changing content after sign-off asks for a fresh review (7.vi).
  await db.odlContentReview.updateMany({ where: { courseId: ctx.id }, data: { seAt: null, idAt: null, updatedAt: new Date() } });
}
export async function refreshVideos(ctx: CourseCtx) {
  const yt = await cfg(ctx.chairmanId, "YOUTUBE");
  const mods = ((await db.odlModule.findMany({ where: { courseId: ctx.id, videoId: { not: null } } })) as Module[]);
  const info = await C.youtubeVideos(yt, mods.map((m) => m.videoId!));
  let n = 0; for (const m of mods) { const v = info.get(m.videoId!); if (v) { await db.odlModule.update({ where: { id: m.id }, data: { videoTitle: v.title, videoMin: v.minutes, captions: v.captions } }); n++; } }
  return { message: `Read ${n} of ${mods.length} video(s) from YouTube.` };
}
/** The SE and the instructional designer each sign the content off (7.vi). */
export async function signContent(user: { id: string; name: string }, ctx: CourseCtx, as: "SE" | "ID", designerId: string | null, notes?: string) {
  if (as === "SE" && user.id !== ctx.subjectExpertId) throw new Error("Only the course's Subject Expert signs as SE.");
  if (as === "ID" && (!designerId || user.id !== designerId)) throw new Error("Only the programme's named Instructional Designer signs as ID.");
  const data = as === "SE" ? { seId: user.id, seName: user.name, seAt: new Date() } : { idId: user.id, idName: user.name, idAt: new Date() };
  await db.odlContentReview.upsert({ where: { courseId: ctx.id }, create: { courseId: ctx.id, ...data, notes: notes || null }, update: { ...data, ...(notes ? { notes } : {}), updatedAt: new Date() } });
}

// ---------------- Facts for the wizard's delivery and running steps ----------------
export async function courseFacts(courseId: string, mode: Mode, ch: number, entered: { moderatedH?: number; gradedH?: number; labH?: number }, labCh: number): Promise<Facts> {
  const { allStored } = await import("./scopedSettings");
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { id: true, managedById: true } } } });
  const cid = course?.coordinator.managedById || course?.coordinator.id || "";
  const [rows, insts, mods, forums, slot, stored] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { lectureNumber: true, week: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE", marksPct: { gt: 0 } }, select: { type: true } }),
    (db.odlModule?.findMany({ where: { courseId } }).catch(() => []) || []) as Promise<Module[]>,
    forumsOf(courseId), slotFor(courseId), allStored(cid).catch(() => []),
  ]);
  const modes = J<Record<string, string>>(stored.find((r) => r.key === `odl.modes.${courseId}`)?.value, {});
  const weekOfN = new Map(rows.map((r) => [r.lectureNumber, r.week]));
  const weeks = new Set(rows.map((r) => r.week)).size;
  const fromDb = (g: boolean) => forums.filter((f) => f.graded === g).reduce((a, f) => a + (f.hours || 0), 0);
  return {
    mode, ch, lectures: rows.length, liveLectures: mode === "SYNC" ? rows.length : rows.filter((r) => modes[String(r.lectureNumber)] && modes[String(r.lectureNumber)] !== "REC").length,
    sessionMin: slot.minutes, recordedMin: mods.reduce((a, m) => a + (m.videoMin || 0), 0),
    moderatedH: forums.length ? fromDb(false) : entered.moderatedH || 0, gradedH: forums.length ? fromDb(true) : entered.gradedH || 0,
    labH: entered.labH, labCh, assignments: insts.filter((i) => /assign/i.test(i.type)).length, quizzes: insts.filter((i) => /quiz/i.test(i.type)).length,
    weeks, readingWeeks: new Set(mods.filter((m) => m.readingUrl).map((m) => weekOfN.get(m.lectureNumber))).size,
    selfWeeks: new Set(mods.filter((m) => m.selfQ > 0).map((m) => weekOfN.get(m.lectureNumber))).size,
    longVideos: mods.filter((m) => (m.videoMin || 0) >= MAX_VIDEO_MIN).length,
  };
}
export { creditCheck };
export async function runningOf(courseId: string) {
  const [sessions, forums, start, n] = await Promise.all([sessionsOf(courseId), forumsOf(courseId), termStart(courseId), prisma.studentEnrollment.count({ where: { courseId } })]);
  return { start, enrolled: n, weeks: weeklyEvidence(sessions, forums, start, n) };
}

/** Who may use a course's teaching tools: its teacher and Program Lead act; the SE, HOD and Institute Head see. */
export async function courseAccess(user: { id: string; role: string }, ctx: CourseCtx): Promise<"act" | "view" | null> {
  if (user.id === ctx.instructorId) return "act";
  const c = await prisma.course.findUnique({ where: { id: ctx.id }, select: { coordinatorId: true } });
  if (c?.coordinatorId === user.id) return "act";
  if (user.id === ctx.subjectExpertId) return "view";
  if (["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role)) {
    const { chairmanIdFor } = await import("./reportScope");
    if ((await chairmanIdFor(user as never)) === ctx.chairmanId) return user.role === "CHAIRMAN" ? "act" : "view";
  }
  return null;
}

/** The Instructional Designer named on an ODL programme of the institute that includes this course. */
export async function designerFor(ctx: CourseCtx) {
  const { listFor, dataOf } = await import("./collab");
  for (const p of await listFor(ctx.chairmanId)) {
    if (p.kind !== "ODL_PROGRAM" && p.kind !== "ODL_COURSE") continue;
    const d = dataOf(p);
    if ((d.courses || []).some((c) => c.code === ctx.code) && d.roles?.designer?.id) return d.roles.designer;
  }
  return null;
}
/** Who builds the ODL content: the SE, the Instructional Designer and the Program Lead; the teacher and the Head see. */
export async function contentAccess(user: { id: string; role: string }, ctx: CourseCtx): Promise<"act" | "view" | null> {
  if (user.id === ctx.subjectExpertId) return "act";
  if ((await designerFor(ctx))?.id === user.id) return "act";
  const c = await prisma.course.findUnique({ where: { id: ctx.id }, select: { coordinatorId: true } });
  if (c?.coordinatorId === user.id) return "act";
  return courseAccess(user, ctx).then((a) => (a ? (user.role === "CHAIRMAN" ? "act" : "view") : null));
}

/** The course's linked classes that have grades, for the marks import (only tools that are connected and OK). */
export async function linkedGradeTools(courseId: string) {
  const ctx = await courseCtx(courseId).catch(() => null); if (!ctx) return [];
  const [ok, links] = await Promise.all([connected(ctx.chairmanId), linksOf(courseId)]);
  return links.filter((l) => l.tool !== "YOUTUBE" && ok.includes(l.tool)).map((l) => ({ tool: l.tool, label: TOOLS[l.tool].label }));
}
