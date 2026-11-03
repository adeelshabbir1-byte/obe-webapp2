import crypto from "crypto";
import { isoMinutes, SCOPES } from "./teachingToolsCore";

// The four teaching tools, called directly with the institute's own credentials (no SDKs): Google (service account with
// domain-wide delegation: Classroom, Calendar + Meet, Meet REST API), Microsoft Graph (app-only: Teams meetings, attendance
// reports, recordings, Teams for Education classes and assignments) and the YouTube Data API. Moodle lives in lib/moodle.ts.

export type Check = { name: string; ok: boolean; note: string };
async function j(url: string, init: RequestInit & { what: string }) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) }).catch((e) => { throw new Error(`${init.what}: could not reach the service (${(e as Error).message}).`); });
  const text = await r.text();
  let d: any = null; try { d = text ? JSON.parse(text) : {}; } catch { d = { raw: text.slice(0, 200) }; }
  if (!r.ok) throw new Error(`${init.what}: ${d?.error?.message || d?.error_description || d?.error || r.status}`);
  return d;
}
const csvq = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
const cache = new Map<string, { token: string; until: number }>();

// ---------------- Google ----------------
export type GoogleCfg = { domain?: string; adminEmail?: string; serviceAccount?: string };
function sa(cfg: GoogleCfg) {
  try { const s = JSON.parse(cfg.serviceAccount || ""); if (s.client_email && s.private_key) return s as { client_email: string; private_key: string }; } catch { /* fall through */ }
  throw new Error("Google is not connected — the IT Manager adds the service account key under Teaching tools.");
}
async function gToken(cfg: GoogleCfg, scopes: string[], subject: string) {
  const s = sa(cfg); const k = `${s.client_email}|${subject}|${scopes.join(" ")}`;
  const c = cache.get(k); if (c && c.until > Date.now()) return c.token;
  const now = Math.floor(Date.now() / 1000);
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b({ alg: "RS256", typ: "JWT" })}.${b({ iss: s.client_email, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, sub: subject })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(s.private_key).toString("base64url");
  const d = await j("https://oauth2.googleapis.com/token", { what: "Google sign-in", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }).toString() });
  cache.set(k, { token: d.access_token, until: Date.now() + (Number(d.expires_in || 3600) - 120) * 1000 });
  return d.access_token as string;
}
const G = SCOPES.GOOGLE;
async function gGet(cfg: GoogleCfg, as: string, scopes: string[], url: string, what: string) { return j(url, { what, headers: { Authorization: `Bearer ${await gToken(cfg, scopes, as)}` } }); }
async function gSend(cfg: GoogleCfg, as: string, scopes: string[], url: string, body: unknown, what: string, method = "POST") { return j(url, { what, method, headers: { Authorization: `Bearer ${await gToken(cfg, scopes, as)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

export async function googleTest(cfg: GoogleCfg): Promise<Check[]> {
  const as = cfg.adminEmail || "";
  if (!as) return [{ name: "Admin account", ok: false, note: "Enter the admin account the service acts as." }];
  const t = async (name: string, f: () => Promise<unknown>, note: string): Promise<Check> => { try { await f(); return { name, ok: true, note }; } catch (e) { return { name, ok: false, note: (e as Error).message }; } };
  return [
    await t("Sign-in (domain-wide delegation)", () => gToken(cfg, [G[0]], as), "the service account can act for your users"),
    await t("Classroom", () => gGet(cfg, as, [G[0]], "https://classroom.googleapis.com/v1/courses?pageSize=1", "Classroom"), "class lists, coursework and grades"),
    await t("Calendar + Meet links", () => gGet(cfg, as, [G[3]], "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1", "Calendar"), "a Meet link for each live lecture"),
    await t("Meet attendance and recordings", () => gGet(cfg, as, [G[4]], "https://meet.googleapis.com/v2/conferenceRecords?pageSize=1", "Meet"), "who joined, for how long, and the recording"),
  ];
}
export async function googleCourses(cfg: GoogleCfg, teacher: string) {
  const d = await gGet(cfg, teacher, [G[0]], "https://classroom.googleapis.com/v1/courses?teacherId=me&courseStates=ACTIVE&pageSize=50", "Classroom");
  return ((d.courses || []) as { id: string; name: string; section?: string; alternateLink: string }[]).map((c) => ({ id: c.id, name: `${c.name}${c.section ? ` (${c.section})` : ""}`, link: c.alternateLink }));
}
async function googleStudents(cfg: GoogleCfg, teacher: string, courseId: string) {
  const out: { id: string; email: string; name: string }[] = []; let page = "";
  do {
    const d = await gGet(cfg, teacher, [G[1]], `https://classroom.googleapis.com/v1/courses/${courseId}/students?pageSize=100${page ? `&pageToken=${page}` : ""}`, "Classroom class list");
    for (const s of d.students || []) out.push({ id: s.userId, email: s.profile?.emailAddress || "", name: s.profile?.name?.fullName || "" });
    page = d.nextPageToken || "";
  } while (page && out.length < 2000);
  return out;
}
export const googleRoster = (cfg: GoogleCfg, teacher: string, courseId: string) => googleStudents(cfg, teacher, courseId);
/** Invites a student to the class (they accept in Classroom; a domain admin's policy can auto-accept). */
export async function googleInvite(cfg: GoogleCfg, teacher: string, courseId: string, email: string) {
  return gSend(cfg, teacher, [G[1]], "https://classroom.googleapis.com/v1/invitations", { userId: email, courseId, role: "STUDENT" }, "Classroom invitation");
}
export async function googlePost(cfg: GoogleCfg, teacher: string, courseId: string, w: { title: string; description: string; maxPoints: number; due?: Date | null; link?: string | null; quiz?: boolean }) {
  const due = w.due ? { dueDate: { year: w.due.getUTCFullYear(), month: w.due.getUTCMonth() + 1, day: w.due.getUTCDate() }, dueTime: { hours: w.due.getUTCHours(), minutes: w.due.getUTCMinutes() } } : {};
  const d = await gSend(cfg, teacher, [G[2]], `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, { title: w.title, description: w.description, maxPoints: w.maxPoints, workType: "ASSIGNMENT", state: "PUBLISHED", ...due, ...(w.link ? { materials: [{ link: { url: w.link, title: w.quiz ? "Open the quiz in OBEHUB" : "Details in OBEHUB" } }] } : {}) }, "Classroom coursework");
  return { id: d.id as string, link: d.alternateLink as string };
}
/** Grades of every graded coursework, as a gradebook CSV the existing import step reads (Email Address = account). */
export async function googleGrades(cfg: GoogleCfg, teacher: string, courseId: string) {
  const students = await googleStudents(cfg, teacher, courseId);
  const work = ((await gGet(cfg, teacher, [G[2]], `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork?pageSize=100`, "Classroom coursework")).courseWork || []) as { id: string; title: string; maxPoints?: number }[];
  const graded = work.filter((w) => (w.maxPoints || 0) > 0);
  const grade = new Map<string, Map<string, number>>();
  for (const w of graded) {
    const subs = (await gGet(cfg, teacher, [G[2]], `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${w.id}/studentSubmissions?pageSize=500`, "Classroom grades")).studentSubmissions || [];
    const m = new Map<string, number>(); for (const s of subs) if (s.assignedGrade != null) m.set(s.userId, Number(s.assignedGrade));
    grade.set(w.id, m);
  }
  const lines = [["Email Address", "Full name", ...graded.map((w) => w.title)].map(csvq).join(","), ["Points", "", ...graded.map((w) => w.maxPoints)].map(csvq).join(",")];
  for (const s of students) if (s.email) lines.push([s.email, s.name, ...graded.map((w) => grade.get(w.id)?.get(s.id) ?? "")].map(csvq).join(","));
  return { csv: lines.join("\n"), students: students.length, items: graded.length };
}
export async function googleMeet(cfg: GoogleCfg, teacher: string, e: { summary: string; description: string; start: Date; end: Date; attendees?: string[] }) {
  const d = await gSend(cfg, teacher, [G[3]], "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none", {
    summary: e.summary, description: e.description, start: { dateTime: e.start.toISOString() }, end: { dateTime: e.end.toISOString() },
    attendees: (e.attendees || []).slice(0, 300).map((email) => ({ email })),
    conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
  }, "Calendar / Meet");
  return { id: String(d.id), joinUrl: String(d.hangoutLink || ""), code: String(d.conferenceData?.conferenceId || "") };
}
/** Meet's own record of a meeting: when it ran, who joined (by name) and the recording, if any. */
export async function googleMeetArtifacts(cfg: GoogleCfg, teacher: string, code: string) {
  const recs = ((await gGet(cfg, teacher, [G[4]], `https://meet.googleapis.com/v2/conferenceRecords?filter=${encodeURIComponent(`space.meeting_code="${code}"`)}`, "Meet")).conferenceRecords || []) as { name: string; startTime: string; endTime?: string }[];
  if (!recs.length) return null;
  const rec = recs.sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
  const people = ((await gGet(cfg, teacher, [G[4]], `https://meet.googleapis.com/v2/${rec.name}/participants?pageSize=250`, "Meet participants")).participants || []) as { signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string }; earliestStartTime?: string; latestEndTime?: string }[];
  const recordings = ((await gGet(cfg, teacher, [G[4]], `https://meet.googleapis.com/v2/${rec.name}/recordings`, "Meet recordings").catch(() => ({}))).recordings || []) as { driveDestination?: { exportUri?: string } }[];
  const min = (a?: string, b?: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
  return {
    heldMinutes: min(rec.startTime, rec.endTime),
    attendance: people.map((p) => ({ name: p.signedinUser?.displayName || p.anonymousUser?.displayName || "Guest", minutes: min(p.earliestStartTime, p.latestEndTime) })),
    recordingUrl: recordings.find((r) => r.driveDestination?.exportUri)?.driveDestination?.exportUri || null,
  };
}

// ---------------- Microsoft Graph ----------------
export type MsCfg = { tenantId?: string; clientId?: string; clientSecret?: string };
async function msToken(cfg: MsCfg) {
  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) throw new Error("Microsoft Teams is not connected — the IT Manager adds the app under Teaching tools.");
  const k = `ms|${cfg.tenantId}|${cfg.clientId}`; const c = cache.get(k); if (c && c.until > Date.now()) return c.token;
  const d = await j(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, { what: "Microsoft sign-in", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString() });
  cache.set(k, { token: d.access_token, until: Date.now() + (Number(d.expires_in || 3600) - 120) * 1000 });
  return d.access_token as string;
}
const GR = "https://graph.microsoft.com/v1.0";
async function ms(cfg: MsCfg, path: string, what: string, body?: unknown, method?: string) {
  return j(`${GR}${path}`, { what, method: method || (body ? "POST" : "GET"), headers: { Authorization: `Bearer ${await msToken(cfg)}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
export async function msTest(cfg: MsCfg): Promise<Check[]> {
  let tok = "";
  try { tok = await msToken(cfg); } catch (e) { return [{ name: "Sign-in", ok: false, note: (e as Error).message }]; }
  let roles: string[] = [];
  try { roles = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).roles || []; } catch { /* opaque token */ }
  const out: Check[] = [{ name: "Sign-in", ok: true, note: "the app signs in to your tenant" }];
  for (const p of SCOPES.MICROSOFT) out.push({ name: p, ok: roles.includes(p) || (p === "OnlineMeetingRecording.Read.All" && roles.includes("OnlineMeetingArtifact.Read.All")), note: roles.includes(p) ? "granted" : p.startsWith("Edu") ? "needed only for Teams for Education classes" : "not granted yet — add it and give admin consent" });
  return out;
}
export async function msClasses(cfg: MsCfg, teacher: string) {
  const u = await ms(cfg, `/users/${encodeURIComponent(teacher)}?$select=id`, "Microsoft user");
  const d = await ms(cfg, `/education/users/${u.id}/classes?$select=id,displayName`, "Teams classes").catch(() => ({ value: [] }));
  return ((d.value || []) as { id: string; displayName: string }[]).map((c) => ({ id: c.id, name: c.displayName, link: "" }));
}
export async function msRoster(cfg: MsCfg, classId: string) {
  const d = await ms(cfg, `/education/classes/${classId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`, "Teams class list");
  return ((d.value || []) as { id: string; displayName: string; mail?: string; userPrincipalName?: string }[]).map((m) => ({ id: m.id, email: m.mail || m.userPrincipalName || "", name: m.displayName }));
}
export async function msPost(cfg: MsCfg, classId: string, w: { title: string; description: string; maxPoints: number; due?: Date | null; link?: string | null }) {
  const a = await ms(cfg, `/education/classes/${classId}/assignments`, "Teams assignment", {
    displayName: w.title, instructions: { contentType: "text", content: `${w.description}${w.link ? `\n${w.link}` : ""}` },
    dueDateTime: (w.due || new Date(Date.now() + 7 * 864e5)).toISOString(),
    grading: { "@odata.type": "#microsoft.graph.educationAssignmentPointsGradeType", maxPoints: w.maxPoints },
    assignTo: { "@odata.type": "#microsoft.graph.educationAssignmentClassRecipient" },
  });
  await ms(cfg, `/education/classes/${classId}/assignments/${a.id}/publish`, "Teams assignment publish", {});
  return { id: String(a.id), link: String(a.webUrl || "") };
}
export async function msGrades(cfg: MsCfg, classId: string) {
  const members = await msRoster(cfg, classId);
  const as = ((await ms(cfg, `/education/classes/${classId}/assignments?$top=100`, "Teams assignments")).value || []) as { id: string; displayName: string; grading?: { maxPoints?: number } }[];
  const graded = as.filter((a) => (a.grading?.maxPoints || 0) > 0);
  const grade = new Map<string, Map<string, number>>();
  for (const a of graded) {
    const subs = ((await ms(cfg, `/education/classes/${classId}/assignments/${a.id}/submissions?$expand=outcomes`, "Teams grades")).value || []) as { recipient?: { userId?: string }; outcomes?: { points?: { points?: number } }[] }[];
    const m = new Map<string, number>();
    for (const s of subs) { const p = s.outcomes?.find((o) => o.points?.points != null)?.points?.points; if (s.recipient?.userId && p != null) m.set(s.recipient.userId, p); }
    grade.set(a.id, m);
  }
  const lines = [["Email Address", "Full name", ...graded.map((a) => a.displayName)].map(csvq).join(","), ["Points", "", ...graded.map((a) => a.grading?.maxPoints)].map(csvq).join(",")];
  for (const s of members) if (s.email) lines.push([s.email, s.name, ...graded.map((a) => grade.get(a.id)?.get(s.id) ?? "")].map(csvq).join(","));
  return { csv: lines.join("\n"), students: members.length, items: graded.length };
}
export async function msMeeting(cfg: MsCfg, organizer: string, e: { subject: string; start: Date; end: Date }) {
  const d = await ms(cfg, `/users/${encodeURIComponent(organizer)}/onlineMeetings`, "Teams meeting", { subject: e.subject, startDateTime: e.start.toISOString(), endDateTime: e.end.toISOString(), recordAutomatically: true, allowRecording: true, allowTranscription: true });
  return { id: String(d.id), joinUrl: String(d.joinWebUrl || "") };
}
export async function msArtifacts(cfg: MsCfg, organizer: string, meetingId: string) {
  const base = `/users/${encodeURIComponent(organizer)}/onlineMeetings/${meetingId}`;
  const reps = ((await ms(cfg, `${base}/attendanceReports`, "Teams attendance")).value || []) as { id: string; meetingStartDateTime?: string; meetingEndDateTime?: string }[];
  if (!reps.length) return null;
  const rep = reps[0];
  const full = await ms(cfg, `${base}/attendanceReports/${rep.id}?$expand=attendanceRecords`, "Teams attendance");
  const recs = ((await ms(cfg, `${base}/recordings`, "Teams recordings").catch(() => ({}))).value || []) as { id: string }[];
  const s = rep.meetingStartDateTime, e = rep.meetingEndDateTime;
  return {
    heldMinutes: s && e ? Math.round((Date.parse(e) - Date.parse(s)) / 60000) : null,
    attendance: ((full.attendanceRecords || []) as { emailAddress?: string; identity?: { displayName?: string }; totalAttendanceInSeconds?: number; role?: string }[]).filter((r) => r.role !== "Organizer").map((r) => ({ name: r.identity?.displayName || r.emailAddress || "Guest", email: r.emailAddress || null, minutes: Math.round((r.totalAttendanceInSeconds || 0) / 60) })),
    recordingUrl: recs.length ? `teams-recording:${meetingId}` : null,
  };
}

// ---------------- YouTube ----------------
export async function youtubeTest(cfg: { apiKey?: string; channelId?: string }): Promise<Check[]> {
  if (!cfg.apiKey) return [{ name: "API key", ok: false, note: "Enter the API key." }];
  try {
    const d = await j(`https://www.googleapis.com/youtube/v3/${cfg.channelId ? `channels?part=snippet&id=${encodeURIComponent(cfg.channelId)}` : "i18nLanguages?part=snippet&hl=en"}&key=${encodeURIComponent(cfg.apiKey)}`, { what: "YouTube" });
    if (cfg.channelId && !(d.items || []).length) return [{ name: "Channel", ok: false, note: "No channel with that id." }];
    return [{ name: "YouTube Data API", ok: true, note: cfg.channelId ? `channel: ${d.items[0].snippet.title}` : "the key works" }];
  } catch (e) { return [{ name: "YouTube Data API", ok: false, note: (e as Error).message }]; }
}
export async function youtubeVideos(cfg: { apiKey?: string }, ids: string[]) {
  const out = new Map<string, { title: string; minutes: number | null; captions: boolean }>();
  if (!cfg.apiKey) throw new Error("YouTube is not connected — the IT Manager adds the API key under Teaching tools.");
  for (let i = 0; i < ids.length; i += 50) {
    const d = await j(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.slice(i, i + 50).join(",")}&key=${encodeURIComponent(cfg.apiKey)}`, { what: "YouTube" });
    for (const v of d.items || []) out.set(v.id, { title: v.snippet?.title || "", minutes: isoMinutes(v.contentDetails?.duration || ""), captions: v.contentDetails?.caption === "true" });
  }
  return out;
}
