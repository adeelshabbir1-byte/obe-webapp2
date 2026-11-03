import { test } from "node:test";
import assert from "node:assert/strict";
import { creditCheck, emailFor, isoMinutes, lmsCoverage, READINESS, splitConfig, weeklyEvidence, youtubeId, LMS_FEATURES, type Facts } from "../lib/teachingToolsCore";

const base: Facts = { mode: "ASYNC", ch: 3, lectures: 30, liveLectures: 0, sessionMin: 60, recordedMin: 1275, moderatedH: 15, gradedH: 12, assignments: 1, quizzes: 2, weeks: 15, readingWeeks: 15, selfWeeks: 15, longVideos: 0 };

test("asynchronous course: 425 min recorded, 5 h moderated and 4 h graded per CH (ODL 8.1.ii.b)", () => {
  assert.ok(creditCheck(base).every((l) => l.ok));
  const short = creditCheck({ ...base, recordedMin: 1274, gradedH: 11 });
  assert.deepEqual(short.filter((l) => !l.ok).map((l) => l.clause), ["8.1.ii.b.i", "8.1.ii.b.iii"]);
});
test("synchronous: 15 live hours per CH; blended: at least 1/3 live or face-to-face (8.1.ii.a, 8.2.3.ii)", () => {
  assert.equal(creditCheck({ ...base, mode: "SYNC", liveLectures: 30, sessionMin: 90 }).find((l) => l.clause === "8.1.ii.a")!.ok, true);
  assert.equal(creditCheck({ ...base, mode: "SYNC", liveLectures: 30, sessionMin: 80 }).find((l) => l.clause === "8.1.ii.a")!.ok, false);
  assert.equal(creditCheck({ ...base, mode: "BLENDED", liveLectures: 10 }).find((l) => l.clause === "8.2.3.ii")!.ok, true);
  assert.equal(creditCheck({ ...base, mode: "BLENDED", liveLectures: 9 }).find((l) => l.clause === "8.2.3.ii")!.ok, false);
});
test("activities of 8.1.ii.e, per course or per credit hour as the institute reads it; long videos flagged (7.iv.h)", () => {
  assert.equal(creditCheck(base).find((l) => l.clause === "8.1.ii.e.iii")!.ok, true);
  assert.equal(creditCheck(base, true).find((l) => l.clause === "8.1.ii.e.iii")!.ok, false);
  assert.equal(creditCheck({ ...base, selfWeeks: 14 }).find((l) => l.clause === "8.1.ii.e.iv")!.ok, false);
  assert.ok(creditCheck({ ...base, longVideos: 2 }).some((l) => l.clause === "7.iv.h" && !l.ok));
  assert.ok(creditCheck({ ...base, labCh: 1, labH: 44 }).some((l) => l.clause.startsWith("8.1.ii.d") && !l.ok));
});
test("durations, YouTube ids and student accounts", () => {
  assert.equal(isoMinutes("PT1H2M30S"), 62.5);
  assert.equal(isoMinutes("PT45S"), 0.8);
  assert.equal(isoMinutes("bad"), null);
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://example.com/v"), null);
  assert.equal(emailFor("{roll}@students.uni.edu.pk", "BSCS 21-045"), "bscs21-045@students.uni.edu.pk");
  assert.equal(emailFor("{rollplain}@s.uni.pk", "BSCS-21-045"), "bscs21045@s.uni.pk");
  assert.equal(emailFor(undefined, "x"), null);
});
test("settings: secrets kept apart, bad values refused", () => {
  const r = splitConfig("MOODLE", { url: "https://lms.x.edu.pk/", token: "abc" });
  assert.deepEqual(r, { plain: { url: "https://lms.x.edu.pk" }, secret: { token: "abc" } });
  assert.throws(() => splitConfig("MOODLE", { url: "http://lms.x.edu.pk" }));
  assert.throws(() => splitConfig("GOOGLE", { serviceAccount: "{\"a\":1}" }));
  assert.throws(() => splitConfig("MICROSOFT", { studentEmail: "students.uni.pk" }));
  assert.deepEqual(splitConfig("YOUTUBE", { apiKey: "" }).secret, {});
});
test("weekly evidence: held, recordings, attendance and late items", () => {
  const start = new Date("2026-09-01T00:00:00Z"), now = new Date("2026-09-20T00:00:00Z");
  const s = (n: number, day: number, status: string, rec: string | null, att: number | null) => ({ lectureNumber: n, startsAt: new Date(start.getTime() + day * 864e5), endsAt: new Date(start.getTime() + day * 864e5 + 3600e3), status, recordingUrl: rec, attendees: att, heldMinutes: null });
  const w = weeklyEvidence([s(1, 1, "HELD", "https://r", 40), s(2, 3, "PLANNED", null, null), s(3, 8, "HELD", null, 30)], [{ week: 1, graded: false, posts: 12, teacherPosts: 3, hours: 1.5 }], start, 50, now);
  assert.equal(w.length, 2);
  assert.deepEqual([w[0].planned, w[0].held, w[0].recordings, w[0].attendancePct, w[0].posts, w[0].discussionH], [2, 1, 1, 80, 12, 1.5]);
  assert.deepEqual(w[0].late, ["Lecture 2: not confirmed as held"]);
  assert.deepEqual(w[1].late, ["Lecture 3: recording not linked"]);
});
test("LMS features of ODL 10.ii: all 15 listed; OBEHUB plus the tools cover them", () => {
  assert.equal(LMS_FEATURES.length, 15);
  const none = lmsCoverage([]); assert.deepEqual(none.filter((f) => !f.ok).map((f) => f.n), [6, 7]);
  assert.ok(lmsCoverage(["MOODLE"]).every((f) => f.ok));
});
test("Toolkit Part-B has its 42 questions, each with a clause", () => {
  assert.equal(READINESS.length, 42);
  assert.deepEqual(READINESS.map((q) => q.n), Array.from({ length: 42 }, (_, i) => i + 1));
  assert.ok(READINESS.every((q) => q.clause && q.q.endsWith("?")));
});
