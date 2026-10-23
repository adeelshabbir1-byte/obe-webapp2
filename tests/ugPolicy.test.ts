import { test } from "node:test";
import assert from "node:assert/strict";
import { GE_REQS, GE_TOTAL, GE_RULE_DEFAULTS, checkGenEd, genEdSummary } from "../lib/ugPolicy";
import { isComplex } from "../lib/complexCoverage";

const c = (code: string, title: string, creditHours: number, courseType = "General Education") => ({ code, title, creditHours, courseType, semesterNumber: 1, isNonCredit: false, trackName: null });

test("the policy's General Education: 11 requirements, 12 courses, 30 credit hours", () => {
  assert.equal(GE_REQS.length, 11);
  assert.equal(GE_REQS.reduce((t, r) => t + r.courses, 0), GE_TOTAL.courses);
  assert.equal(GE_REQS.reduce((t, r) => t + r.credits, 0), GE_TOTAL.credits);
});

test("each requirement: met by a marked course, suggested from the title, or reported with what to add", () => {
  const scheme = [c("GE-1", "Islamic Studies", 2), c("GE-2", "Ideology and Constitution of Pakistan", 2), c("GE-3", "Functional English", 3), c("GE-4", "Expository Writing", 3, "IDS"), c("MT-1", "Calculus", 3, "Core"), c("MT-2", "Statistics", 3, "Core"), c("X-1", "Pakistan Culture", 2)];
  const marks = new Map([["X-1", "ARTS"]]);
  const lines = checkGenEd(scheme, marks, GE_RULE_DEFAULTS);
  const by = (k: string) => lines.find((l) => l.req.key === k)!;
  assert.ok(by("ISLAMIC").ok && !by("ISLAMIC").courses[0].marked);
  assert.ok(by("ARTS").ok && by("ARTS").courses[0].marked);
  assert.ok(by("QR").ok && by("QR").courses.length === 2);
  assert.ok(by("QR").todo.some((t) => /Change the type of MT-1/.test(t)));
  assert.ok(by("EXPOSITORY").todo.some((t) => /General Education/.test(t)));
  assert.ok(!by("ICT").ok && /Add Applications of ICT/.test(by("ICT").todo[0]));
  assert.ok(!by("CIVICS").ok);
  const s = genEdSummary(lines);
  assert.equal(s.total, 11);
  assert.ok(!s.ok);
  // A course marked NONE is never suggested.
  const none = checkGenEd([c("GE-1", "Islamic Studies", 2)], new Map([["GE-1", "NONE"]]), GE_RULE_DEFAULTS);
  assert.ok(!none.find((l) => l.req.key === "ISLAMIC")!.ok);
  // Too few credits.
  const short = checkGenEd([c("GE-9", "Entrepreneurship", 1)], new Map(), GE_RULE_DEFAULTS);
  assert.ok(short.find((l) => l.req.key === "ENTREPRENEURSHIP")!.todo.some((t) => /Needs 2 credit hours/.test(t)));
});

test("a complex problem needs depth of knowledge (P1)", () => {
  assert.ok(isComplex(["P1", "P3"]));
  assert.ok(!isComplex(["P2", "P3", "CK2"]));
});
