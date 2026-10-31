import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_ROLES, readyPlan, roleByKey, sampleScore, semNow, termDates, ability, CAMPUS_PARTS } from "../lib/demoReadyCore";
import { termOfSem, currentSemOf } from "../lib/demoInstitute";

test("batches S1, S3, S5, S7 in Fall 2026", () => {
  assert.deepEqual([2026, 2025, 2024, 2023].map(semNow), [1, 3, 5, 7]);
  assert.equal(currentSemOf("Fall", 2024), 5);
  assert.deepEqual(termOfSem("Fall", 2024, 1), ["Fall", 2024]);
  assert.deepEqual(termOfSem("Fall", 2024, 2), ["Spring", 2025]);
  assert.deepEqual(termOfSem("Fall", 2023, 7), ["Fall", 2026]);
  assert.deepEqual(termOfSem("Fall", 2026, 1), ["Fall", 2026]);
});

test("the plan: delete first, the demo course chosen before the term ends, results after marks, check last", () => {
  const p = readyPlan();
  const at = (k: string) => p.findIndex((s) => s.key === k);
  assert.equal(p[0].key, "delete");
  assert.equal(p[1].key, "setup");
  assert.equal(p[p.length - 1].key, "check");
  assert.ok(at("bos") < at("pickDemo"), "codes are approved before the running offerings finish");
  assert.ok(at("pickDemo") < at("endTerm"));
  assert.ok(p.findLastIndex((s) => s.key === "endTerm") < at("approve"));
  // Every batch's courses come before its marks, every batch is added before its courses.
  for (const prog of ["CS", "AI", "BBA"]) for (const start of [2023, 2025, 2026]) {
    const add = p.findIndex((s) => s.key === "addBatch" && s.p === prog && s.start === start);
    const firstCourses = p.findIndex((s) => s.key === "courses" && s.p === prog && s.start === start);
    const lastActivity = p.findLastIndex((s) => s.key === "activity" && s.p === prog && s.start === start);
    assert.ok(add >= 0 && add < firstCourses && firstCourses < lastActivity, `${prog} ${start}`);
    assert.equal(p.filter((s) => s.key === "activity" && s.p === prog && s.start === start).length, semNow(start));
  }
  assert.equal(p.filter((s) => s.key === "campus").length, CAMPUS_PARTS.length);
  assert.equal(p.filter((s) => s.key === "endTerm").length, 12);
  assert.ok(p.every((s) => s.label.length > 0));
});

test("sample marks are realistic, repeatable and within the maximum", () => {
  const a = sampleScore("DRM-CS-24-001", "inst-1", 100, "Final");
  assert.equal(a, sampleScore("DRM-CS-24-001", "inst-1", 100, "Final"));
  const all = Array.from({ length: 120 }, (_, i) => sampleScore(`DRM-CS-24-${String(i + 1).padStart(3, "0")}`, "inst-1", 100, "Final"));
  assert.ok(all.every((x) => x >= 0 && x <= 100 && Math.round(x * 2) === x * 2));
  const mean = all.reduce((s, x) => s + x, 0) / all.length;
  assert.ok(mean > 50 && mean < 80, `mean ${mean}`);
  assert.ok(new Set(all).size > 20, "spread out, not one value");
  assert.ok(ability("x") >= 0.3 && ability("x") <= 0.97);
});

test("term dates: teaching ended before today, the final was two days ago", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const t = termDates(now);
  assert.ok(t.lecture(32, 16) < now && t.lecture(1, 1) < t.lecture(32, 16));
  assert.equal(t.lecture(1, 1).getUTCDay(), 1, "the term starts on a Monday");
  assert.equal(Math.round((now.getTime() - t.finalHeld.getTime()) / 864e5), 2);
});

test("one demo login per role, each with its daily task", () => {
  for (const k of ["dean", "hod", "lead", "dc", "omcConvener", "omc", "bos", "se", "instructor", "labeng", "controller", "qec", "student"]) assert.ok(roleByKey(k), k);
  assert.equal(new Set(DEMO_ROLES.map((r) => r.key)).size, DEMO_ROLES.length);
  assert.ok(DEMO_ROLES.every((r) => r.daily.length > 10 && (r.student || /^dream\./.test(r.username || ""))));
  assert.equal(roleByKey("nobody"), null);
});
