import { test } from "node:test";
import assert from "node:assert/strict";
import { effectOf, reviewMarker, strengthOf } from "../lib/prereqCascade";
import { bookKey, courseKey, parseBookLine, TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/courseResources";
import { money } from "../lib/remediation";
import { leadershipPoints, validTime } from "../lib/engagement";
import { pairKey, topicKeyOf } from "../lib/overlapMatrix";

test("link strengths: unknown values fall back to Mild, and each strength explains its effect", () => {
  assert.equal(strengthOf("STRONG"), "STRONG");
  assert.equal(strengthOf("bogus"), "MILD");
  assert.equal(strengthOf(null), "MILD");
  const l = { prereqCourseCode: "CS-101", prereqTopic: "Functions", dependentCourseCode: "CS-201", dependentTopic: "Stored procedures" };
  assert.match(effectOf({ ...l, strength: "STRONG" }), /must pass CS-101 .* before they can register for CS-201/);
  assert.match(effectOf({ ...l, strength: "MILD" }), /may register .* plans a review of "Functions"/);
  assert.match(effectOf({ ...l, strength: "WEAK" }), /short recap/);
  assert.equal(reviewMarker(l), "[Review: Functions (CS-101)]");
});

test("course keys match the same HEC course across institutes", () => {
  assert.equal(courseKey("Programming Fundamentals"), courseKey("PROGRAMMING FUNDAMENTALS"));
  assert.equal(courseKey("Programming Fundamentals Lab"), courseKey("Programming Fundamentals"));
  assert.equal(courseKey("Calculus & Analytical Geometry"), courseKey("Calculus and Analytical Geometry"));
  assert.notEqual(courseKey("Data Structures"), courseKey("Database Systems"));
});

test("free-text book lines are read into title, authors, edition, publisher and year", () => {
  const a = parseBookLine("1. C++ How to Program, Deitel & Deitel, 10th Edition, Pearson, 2017")!;
  assert.equal(a.title, "C++ How to Program");
  assert.equal(a.authors, "Deitel & Deitel");
  assert.equal(a.edition, "10th Edition");
  assert.equal(a.publisher, "Pearson");
  assert.equal(a.year, 2017);
  const b = parseBookLine("“Introduction to Algorithms” by Cormen, MIT Press, 3rd ed., ISBN 978-0262033848")!;
  assert.equal(b.title, "Introduction to Algorithms");
  assert.equal(b.isbn, "978-0262033848");
  assert.equal(b.publisher, "MIT Press");
  assert.equal(parseBookLine("  - "), null);
  // The same book typed twice is one book in the pool.
  assert.equal(bookKey({ title: "C++ How to Program", authors: "Deitel & Deitel" }), bookKey({ title: "c++ how to program", authors: "Deitel and Deitel, P." }));
});

test("the tool catalogue only uses known categories and has no duplicates", () => {
  for (const t of TOOL_CATALOG) assert.ok(TOOL_CATEGORIES[t.category], t.name);
  assert.equal(new Set(TOOL_CATALOG.map((t) => t.name.toLowerCase())).size, TOOL_CATALOG.length);
});

test("remediation money: fees collected, due, the teacher's share and what is still owed", () => {
  const plan = { feePerStudent: 2000, instructorSharePct: 70, payoutAmount: 1000 };
  const m = money(plan, [
    { feeAmount: 2000, feeStatus: "PAID", status: "CLEARED" },
    { feeAmount: 2000, feeStatus: "PAID", status: "ENROLLED" },
    { feeAmount: 2000, feeStatus: "UNPAID", status: "ENROLLED" },
    { feeAmount: 2000, feeStatus: "WAIVED", status: "ENROLLED" },
    { feeAmount: 2000, feeStatus: "PAID", status: "WITHDRAWN" },
  ]);
  assert.deepEqual(m, { collected: 4000, due: 2000, share: 2800, paidOut: 1000, owed: 1800 });
});

test("engagement: office points by position and event times", () => {
  assert.equal(leadershipPoints("President"), 20);
  assert.equal(leadershipPoints("Member"), 3);
  assert.equal(leadershipPoints("Something new"), 6);
  assert.equal(validTime("14:00"), true);
  assert.equal(validTime("9:30"), true);
  assert.equal(validTime("25:00"), false);
  assert.equal(validTime("2pm"), false);
});

test("overlap keys do not depend on which course or topic comes first", () => {
  assert.equal(pairKey("CS-201", "CS-101"), pairKey("CS-101", "CS-201"));
  assert.equal(topicKeyOf("Arrays", "Arrays and Strings"), topicKeyOf("Arrays and Strings", "Arrays"));
});
