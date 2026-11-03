// ODL teaching tools and the ODL running checks — pure functions only (tested in tests/teachingTools.test.ts).
// Every rule cites its clause in sources/HEC-ODL-policy.md (Part-II unless marked Part-I) or the HEC ODL Toolkit.

export type Tool = "MOODLE" | "GOOGLE" | "MICROSOFT" | "YOUTUBE";
export type Field = { key: string; label: string; secret?: boolean; placeholder?: string; long?: boolean; help?: string };
export const TOOLS: Record<Tool, { label: string; does: string; setup: string; fields: Field[] }> = {
  MOODLE: {
    label: "Moodle",
    does: "Enrols the class, makes a section per lecture topic, pulls quiz marks per question and forum activity.",
    setup: "Site administration → Server → Web services: enable web services and REST, create a service with the functions listed below, a dedicated user with a token. Moodle 4.x.",
    fields: [
      { key: "url", label: "Moodle address", placeholder: "https://lms.university.edu.pk" },
      { key: "token", label: "Web-service token", secret: true },
    ],
  },
  GOOGLE: {
    label: "Google Classroom + Meet",
    does: "Copies the class list, posts quizzes and assignments, pulls grades, makes a Meet link for every live lecture, and reads Meet attendance and recordings.",
    setup: "Google Workspace for Education (Plus for Meet attendance and recordings). In Google Cloud: a service account with domain-wide delegation for the scopes listed below, then its JSON key here.",
    fields: [
      { key: "domain", label: "Workspace domain", placeholder: "university.edu.pk" },
      { key: "adminEmail", label: "Admin account the service acts as for set-up checks", placeholder: "lms.admin@university.edu.pk" },
      { key: "studentEmail", label: "Student account pattern", placeholder: "{roll}@students.university.edu.pk", help: "{roll} = roll number in small letters without spaces; {rollplain} = letters and digits only." },
      { key: "serviceAccount", label: "Service account key (JSON)", secret: true, long: true },
    ],
  },
  MICROSOFT: {
    label: "Microsoft Teams",
    does: "Makes a Teams meeting for every live lecture, reads attendance reports and recordings, and with Teams for Education the class list, assignments and grades.",
    setup: "Microsoft 365 A3/A5. Entra ID → App registrations: an app with the Graph application permissions listed below (admin consent), a client secret, and a Teams application access policy that lets the app create meetings for teachers.",
    fields: [
      { key: "tenantId", label: "Tenant (directory) id" },
      { key: "clientId", label: "App (client) id" },
      { key: "studentEmail", label: "Student account pattern", placeholder: "{roll}@students.university.edu.pk", help: "{roll} = roll number in small letters without spaces; {rollplain} = letters and digits only." },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
  },
  YOUTUBE: {
    label: "YouTube",
    does: "Reads each linked video's title and length, so recorded minutes count against the asynchronous rule and long videos are flagged.",
    setup: "Google Cloud → APIs: enable YouTube Data API v3 and create an API key restricted to it. Public or unlisted videos only.",
    fields: [
      { key: "channelId", label: "Institute channel id (optional)", placeholder: "UC…" },
      { key: "apiKey", label: "API key", secret: true },
    ],
  },
};
export const TOOL_KEYS = Object.keys(TOOLS) as Tool[];
export const isTool = (s: string): s is Tool => (TOOL_KEYS as string[]).includes(s);
export const SCOPES = {
  MOODLE: ["core_webservice_get_site_info", "core_course_get_contents", "core_course_get_courses_by_field", "core_course_update_courses", "core_update_inplace_editable", "core_user_get_users_by_field", "core_user_create_users", "enrol_manual_enrol_users", "core_enrol_get_enrolled_users", "gradereport_user_get_grade_items", "mod_quiz_get_quizzes_by_courses", "mod_quiz_get_user_attempts", "mod_quiz_get_attempt_review", "mod_forum_get_forums_by_courses", "mod_forum_get_forum_discussions", "mod_forum_get_discussion_posts"],
  GOOGLE: ["https://www.googleapis.com/auth/classroom.courses.readonly", "https://www.googleapis.com/auth/classroom.rosters", "https://www.googleapis.com/auth/classroom.coursework.students", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/meetings.space.readonly"],
  MICROSOFT: ["OnlineMeetings.ReadWrite.All", "OnlineMeetingArtifact.Read.All", "OnlineMeetingRecording.Read.All", "User.Read.All", "EduRoster.Read.All", "EduAssignments.ReadWrite.All"],
  YOUTUBE: ["YouTube Data API v3 (videos.list)"],
} as Record<Tool, string[]>;

/** Splits a submitted form into the plain settings and the secret ones. A blank secret keeps the stored one. */
export function splitConfig(tool: Tool, form: Record<string, unknown>) {
  const plain: Record<string, string> = {}, secret: Record<string, string> = {};
  for (const f of TOOLS[tool].fields) {
    const v = String(form[f.key] ?? "").trim();
    if (f.secret) { if (v) secret[f.key] = v; } else plain[f.key] = v;
  }
  if (plain.url) plain.url = plain.url.replace(/\/+$/, "");
  if (tool === "MOODLE" && plain.url && !/^https:\/\//.test(plain.url)) throw new Error("The Moodle address must start with https://");
  for (const k of ["studentEmail"]) if (plain[k] && !/\{roll(plain)?\}@[\w.-]+\.\w+$/.test(plain[k])) throw new Error("The student account pattern must look like {roll}@students.university.edu.pk");
  if (secret.serviceAccount) {
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(secret.serviceAccount); } catch { throw new Error("The service account key must be the JSON file Google gives you."); }
    if (!j.client_email || !j.private_key) throw new Error("That JSON has no client_email / private_key — download a key for the service account.");
  }
  return { plain, secret };
}

/** A student's account in the institute's Google / Microsoft domain, from the roll number. */
export function emailFor(pattern: string | undefined, roll: string) {
  if (!pattern) return null;
  const r = roll.trim().toLowerCase().replace(/\s+/g, "");
  return pattern.replace("{rollplain}", r.replace(/[^a-z0-9]/g, "")).replace("{roll}", r);
}

/** ISO-8601 duration ("PT1H2M30S") to minutes. */
export function isoMinutes(d: string) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(d || "");
  if (!m) return null;
  return Math.round(((+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) + (+(m[4] || 0)) / 60) * 10) / 10;
}
/** The video id of a YouTube link (watch, youtu.be, embed, shorts, live) or a bare id. */
export function youtubeId(url: string) {
  const s = (url || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(s);
  return m ? m[1] : null;
}
export const MAX_VIDEO_MIN = 30; // 7.iv.h: "in general, an effective length of time for a course content is below 30 minutes"

// ---- Credit-hour rules per delivery mode (8.1, 8.2.3) and the activities of 8.1.ii.e.
export type Mode = "SYNC" | "ASYNC" | "BLENDED";
export type Facts = {
  mode: Mode; ch: number; lectures: number; liveLectures: number; sessionMin: number; recordedMin: number; moderatedH: number; gradedH: number;
  labH?: number; labCh?: number; assignments: number; quizzes: number; weeks: number; readingWeeks: number; selfWeeks: number; longVideos: number;
};
export type Line = { rule: string; clause: string; need: string; have: string; ok: boolean; note?: string };
const h = (x: number) => `${Math.round(x * 10) / 10} h`;
export function creditCheck(f: Facts, perCh = false): Line[] {
  const out: Line[] = [];
  const liveH = (f.liveLectures * f.sessionMin) / 60;
  if (f.mode === "SYNC") out.push({ rule: "Live teaching", clause: "8.1.ii.a", need: `${15 * f.ch}–${16 * f.ch} h (15–16 h per CH)`, have: h(liveH), ok: liveH >= 15 * f.ch });
  if (f.mode === "ASYNC") {
    out.push({ rule: "Pre-recorded lectures", clause: "8.1.ii.b.i", need: `${425 * f.ch} min (85 five-minute modules per CH)`, have: `${Math.round(f.recordedMin)} min`, ok: f.recordedMin >= 425 * f.ch });
    out.push({ rule: "Moderated discussion board", clause: "8.1.ii.b.ii", need: h(5 * f.ch), have: h(f.moderatedH), ok: f.moderatedH >= 5 * f.ch });
    out.push({ rule: "Graded discussion board", clause: "8.1.ii.b.iii", need: h(4 * f.ch), have: h(f.gradedH), ok: f.gradedH >= 4 * f.ch });
  }
  if (f.mode === "BLENDED") {
    const pct = f.lectures ? (100 * f.liveLectures) / f.lectures : 0;
    out.push({ rule: "Face-to-face or live share", clause: "8.2.3.ii", need: "at least 1/3 of the credit hours", have: `${Math.round(pct)}% of lectures`, ok: pct >= 100 / 3 });
  }
  if ((f.labCh ?? 0) > 0) out.push({ rule: "Lab / practical work, face-to-face", clause: "8.1.ii.d, 11.x", need: `${45 * (f.labCh || 0)}–${48 * (f.labCh || 0)} h`, have: h(f.labH || 0), ok: (f.labH || 0) >= 45 * (f.labCh || 0) });
  const k = perCh ? Math.max(1, f.ch) : 1;
  const note = perCh ? "counted per credit hour, as the institute reads 8.1.ii.e" : undefined;
  out.push({ rule: "Graded assignments", clause: "8.1.ii.e.i", need: `at least ${k}`, have: String(f.assignments), ok: f.assignments >= k, note });
  out.push({ rule: "Graded quizzes", clause: "8.1.ii.e.iii", need: String(2 * k), have: String(f.quizzes), ok: f.quizzes >= 2 * k, note });
  out.push({ rule: "Weekly reading (1 h a week)", clause: "8.1.ii.e.ii", need: `${f.weeks} weeks`, have: `${f.readingWeeks} weeks`, ok: f.readingWeeks >= f.weeks });
  out.push({ rule: "Weekly online self-assessment", clause: "8.1.ii.e.iv", need: `${f.weeks} weeks`, have: `${f.selfWeeks} weeks`, ok: f.selfWeeks >= f.weeks });
  if (f.longVideos > 0) out.push({ rule: "Recorded lectures under 30 minutes (guide)", clause: "7.iv.h", need: "each video under 30 min", have: `${f.longVideos} longer`, ok: false, note: "a guideline: split long videos into shorter modules" });
  return out;
}

// ---- Running the term: weekly evidence (12.5 internal monitoring; 21.1.viii LMS attendance records; 21.1.ix active time).
export type SessionRow = { lectureNumber: number; startsAt: Date; endsAt: Date; status: string; recordingUrl: string | null; attendees: number | null; heldMinutes: number | null };
export type ForumRow = { week: number; graded: boolean; posts: number; teacherPosts: number; hours: number | null };
export type WeekRow = { week: number; planned: number; held: number; notHeld: number; recordings: number; attendancePct: number | null; posts: number; teacherPosts: number; discussionH: number; late: string[] };
export function weekOf(d: Date, start: Date) { return Math.max(1, Math.floor((d.getTime() - start.getTime()) / (7 * 864e5)) + 1); }
export function weeklyEvidence(sessions: SessionRow[], forums: ForumRow[], start: Date, enrolled: number, now = new Date()): WeekRow[] {
  const rows = new Map<number, WeekRow>();
  const row = (w: number) => { if (!rows.has(w)) rows.set(w, { week: w, planned: 0, held: 0, notHeld: 0, recordings: 0, attendancePct: null, posts: 0, teacherPosts: 0, discussionH: 0, late: [] }); return rows.get(w)!; };
  const att = new Map<number, number[]>();
  for (const s of sessions) {
    const r = row(weekOf(s.startsAt, start)); r.planned++;
    if (s.status === "HELD") { r.held++; if (s.attendees != null && enrolled > 0) att.set(r.week, [...(att.get(r.week) || []), Math.min(100, (100 * s.attendees) / enrolled)]); }
    if (s.status === "NOT_HELD") r.notHeld++;
    if (s.recordingUrl) r.recordings++;
    const overdue = now.getTime() - s.endsAt.getTime() > 2 * 864e5;
    if (overdue && s.status === "PLANNED") r.late.push(`Lecture ${s.lectureNumber}: not confirmed as held`);
    if (overdue && s.status === "HELD" && !s.recordingUrl) r.late.push(`Lecture ${s.lectureNumber}: recording not linked`);
  }
  for (const f of forums) { const r = row(f.week); r.posts += f.posts; r.teacherPosts += f.teacherPosts; r.discussionH += f.hours || 0; }
  for (const [w, a] of Array.from(att.entries())) row(w).attendancePct = Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  return Array.from(rows.values()).sort((a, b) => a.week - b.week);
}

// ---- LMS features of 10.ii, and who provides each: OBEHUB itself or a connected tool.
export type Cover = "yes" | "partial" | "no";
export const LMS_FEATURES: { n: number; name: string; obehub: string | null; MOODLE: Cover; GOOGLE: Cover; MICROSOFT: Cover }[] = [
  { n: 1, name: "Course introduction", obehub: "/catalog", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 2, name: "Objectives", obehub: "/student/my-clos", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 3, name: "Course outline (chapters and topics)", obehub: "/student/my-clos", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "partial" },
  { n: 4, name: "Course calendar", obehub: "/academic-calendar", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 5, name: "Instructor profile", obehub: "/faculty/profile", MOODLE: "yes", GOOGLE: "partial", MICROSOFT: "partial" },
  { n: 6, name: "Announcements", obehub: null, MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 7, name: "Discussion forum", obehub: null, MOODLE: "yes", GOOGLE: "partial", MICROSOFT: "yes" },
  { n: 8, name: "Learning objects", obehub: "/topic-resources", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 9, name: "Assignments", obehub: "/student/submissions", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 10, name: "Quizzes (self-assessment and graded)", obehub: "/student/quizzes", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 11, name: "Grade scheme", obehub: "/student/obe-analytics", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 12, name: "Gradebook", obehub: "/student/transcript", MOODLE: "yes", GOOGLE: "yes", MICROSOFT: "yes" },
  { n: 13, name: "Attendance", obehub: "/student/attendance", MOODLE: "partial", GOOGLE: "partial", MICROSOFT: "yes" },
  { n: 14, name: "Feedback", obehub: "/student/course-survey", MOODLE: "yes", GOOGLE: "partial", MICROSOFT: "partial" },
  { n: 15, name: "Ticket (alert raised by a student)", obehub: "/student/complaints", MOODLE: "no", GOOGLE: "no", MICROSOFT: "no" },
];
export function lmsCoverage(connected: Tool[]) {
  return LMS_FEATURES.map((f) => {
    const by = (["MOODLE", "GOOGLE", "MICROSOFT"] as const).filter((t) => connected.includes(t) && f[t] === "yes");
    return { ...f, by, ok: !!f.obehub || by.length > 0 };
  });
}

// ---- Toolkit Part-B: Program Readiness (42 questions), each with the clause the Toolkit cites. "auto" names the OBEHUB
// record that can answer it.
export const READINESS: { n: number; area: string; clause: string; q: string; auto?: string }[] = [
  { n: 1, area: "Statutory approvals", clause: "5.i", q: "Programme approved by the Board of Studies?", auto: "bos" },
  { n: 2, area: "Statutory approvals", clause: "5.i", q: "Programme approved by the Academic Council or equivalent?", auto: "council" },
  { n: 3, area: "Aims and goals", clause: "5.1.2.i", q: "Aims and goals aligned with the HEI's Act and mission, societal needs and industry demands?", auto: "peos" },
  { n: 4, area: "Prospective learners", clause: "5.1.2.ii", q: "Proposal profiles the target learners and their needs, in groups (low-income, rural, women, unskilled …)?" },
  { n: 5, area: "Prospective learners", clause: "5.1.2.ii", q: "Proposal offers a SWOT analysis to justify the ODL launch?" },
  { n: 6, area: "Relevance", clause: "5.1.2.iii", q: "Expected knowledge, skills and competencies clearly stated?", auto: "plos" },
  { n: 7, area: "Relevance", clause: "5.1.2.iii", q: "Module / unit objectives measurable and consistent with course objectives?", auto: "topicClo" },
  { n: 8, area: "Relevance", clause: "5.1.2.iii", q: "Programme objectives and course learning outcomes mapped, measurable?", auto: "cloPlo" },
  { n: 9, area: "Instructional design", clause: "5.1.2.iv", q: "Proposal justifies the delivery mode (synchronous, asynchronous, blended)?", auto: "modes" },
  { n: 10, area: "Instructional design", clause: "5.1.2.iv", q: "Instructional design explained separately for the ODL programme?" },
  { n: 11, area: "Instructional design", clause: "7.iii", q: "Instructional materials contribute to the stated learning objectives?", auto: "content" },
  { n: 12, area: "Instructional design", clause: "7.iv.a, d", q: "Content interactive, engaging, self-explanatory and inclusive?" },
  { n: 13, area: "Instructional design", clause: "7.iv.c", q: "Learning activities and practical components support active learning?" },
  { n: 14, area: "Instructional design", clause: "7.iv.a, e", q: "Proposal prioritises student engagement (interests, interaction, motivation)?" },
  { n: 15, area: "Instructional design", clause: "7.iv.f", q: "Innovations in pedagogy and delivery suit the target groups?" },
  { n: 16, area: "Instructional design", clause: "9.iv, 9.vii", q: "Student–teacher interaction and technologies for in-class communication?", auto: "tools" },
  { n: 17, area: "Instructional design", clause: "5.1.2.vi", q: "Guidelines for lab work, with costing of materials and equipment, where applicable?" },
  { n: 18, area: "Instructional design", clause: "6", q: "Curriculum offers personalisation and flexible pathways?" },
  { n: 19, area: "Instructional design", clause: "11", q: "Evaluation and assessment mechanism measures the programme's objectives?", auto: "assessment" },
  { n: 20, area: "Open educational resources", clause: "Part-I 3(g)", q: "Resources in multiple formats (PDF, PPT, Word, audio, video)?", auto: "formats" },
  { n: 21, area: "Open educational resources", clause: "7.ix", q: "OER on several platforms (LMS, open access, website, DVD, USB)?" },
  { n: 22, area: "Open educational resources", clause: "7.x", q: "OER protected from copyright issues?" },
  { n: 23, area: "Open educational resources", clause: "7.xii", q: "Infrastructure available for OER development?" },
  { n: 24, area: "Admissions and assessment", clause: "15–16", q: "Admission policy, eligibility, fee structure and scholarships described?" },
  { n: 25, area: "Lab and library", clause: "5.1.2.vi", q: "Clear guidelines for face-to-face practical work?" },
  { n: 26, area: "Lab and library", clause: "5.1.2.vi", q: "Facilities arranged for face-to-face practical work?" },
  { n: 27, area: "Cost", clause: "5.1.2.vii", q: "Cost estimate covers development and maintenance?" },
  { n: 28, area: "Quality assurance", clause: "21.1.i", q: "Mechanism to review the ODL programme periodically?" },
  { n: 29, area: "Quality assurance", clause: "21.1.i", q: "Programme team reviews the programme for future needs?" },
  { n: 30, area: "Quality assurance", clause: "21.1.i", q: "E-learning materials interactive, with self-assessment feedback?", auto: "selfAssess" },
  { n: 31, area: "Quality assurance", clause: "21.1.i", q: "Statutory bodies meet often enough to monitor ODL implementation?" },
  { n: 32, area: "Quality assurance", clause: "21.1.i", q: "Reports and dashboards to review the programme's progress?", auto: "obehub" },
  { n: 33, area: "Quality assurance", clause: "21.1.i", q: "Mechanism for evaluating the ODL programme?" },
  { n: 34, area: "Quality assurance", clause: "21.1.i", q: "Third-party evaluation mechanism?" },
  { n: 35, area: "Quality assurance", clause: "21.1.i", q: "Feedback from faculty, students and employers?", auto: "surveys" },
  { n: 36, area: "Quality assurance", clause: "21.1.i", q: "Programme evaluation aligned with the programme's objectives?", auto: "obehub" },
  { n: 37, area: "Quality assurance", clause: "21.1.i", q: "Assessments sequenced, varied and suited to course level?", auto: "assessment" },
  { n: 38, area: "Quality assurance", clause: "21.1.i", q: "Audit reports and dashboards used to evaluate programmes and courses?", auto: "obehub" },
  { n: 39, area: "Quality assurance", clause: "21.1.i", q: "Learners can track their progress with timely feedback?", auto: "obehub" },
  { n: 40, area: "Quality assurance", clause: "21.1.i", q: "Assessments measure the stated objectives?", auto: "assessment" },
  { n: 41, area: "Quality assurance", clause: "21.1.i", q: "Identity verification and plagiarism safeguards?", auto: "integrity" },
  { n: 42, area: "Quality assurance", clause: "21.1.i", q: "Assessment and evaluation rules approved by the competent forum?" },
];
