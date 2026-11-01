import test from "node:test";
import assert from "node:assert/strict";
import { canSee, canUse, draftPaper, paperCheck, makeVariant, profile, itemStats, lockAfterUse, isLocked, termIndex, parseSheet, splitPaper, bloomOf, looksScanned, numericCorrect, mathSegments, readiness, type Item, type Viewer } from "../lib/qbankCore";

const item = (id: string, o: Partial<Item> = {}): Item => ({ id, courseCode: "CS-201", type: "SHORT", text: `Question ${id}`, marks: 5, cloCodes: ["CLO-1"], bloom: "C2", difficulty: "MEDIUM", lectureNumber: 1, week: 1, topic: "T", authorId: "se", status: "APPROVED", visibility: "COURSE", sharedWith: [], parts: [], minutes: 5, lab: false, lockedUntil: null, usedCount: 0, ...o });
const viewer = (id: string, o: Partial<Viewer> = {}): Viewer => ({ id, role: "INSTRUCTOR", isSE: false, isPL: false, teachesCourse: false, grantedIds: new Set(), reviewerOf: new Set(), ...o });

test("who sees a question: private, course teachers, chosen, access code, reviewer of an official paper; students never", () => {
  const priv = item("p", { authorId: "t1", visibility: "PRIVATE", status: "DRAFT" });
  assert.equal(canSee(priv, viewer("t1")), true);
  assert.equal(canSee(priv, viewer("t2", { teachesCourse: true })), false, "private: invisible to other teachers");
  assert.equal(canSee(priv, viewer("se", { isSE: true })), false, "private: not even the SE, unless in an official paper");
  assert.equal(canSee(priv, viewer("se", { isSE: true, reviewerOf: new Set(["p"]) })), true, "in a final paper: its reviewer sees it");
  assert.equal(canSee(priv, viewer("t3", { grantedIds: new Set(["p"]) })), true, "an access code");
  const course = item("c", { authorId: "t1", visibility: "COURSE" });
  assert.equal(canSee(course, viewer("t2", { teachesCourse: true })), true);
  assert.equal(canSee(course, viewer("t9")), false, "not a teacher of this course");
  const chosen = item("x", { authorId: "t1", visibility: "CHOSEN", sharedWith: ["t5"] });
  assert.equal(canSee(chosen, viewer("t5")), true); assert.equal(canSee(chosen, viewer("t6", { teachesCourse: true })), false);
  assert.equal(canSee(item("d", { authorId: "t1", status: "DRAFT" }), viewer("t2", { teachesCourse: true })), false, "a shared draft waits for review");
  assert.equal(canSee(course, viewer("s", { role: "STUDENT", teachesCourse: true })), false);
  assert.equal(canUse(item("d", { authorId: "t1", status: "DRAFT", visibility: "PRIVATE" }), "t1", false), true, "own private question in own quiz: no review");
  assert.equal(canUse(item("d", { authorId: "t1", status: "DRAFT", visibility: "PRIVATE" }), "t1", true), false, "an official paper needs approved questions");
});

test("a question used in a final is locked for 3 terms; a quiz never locks", () => {
  assert.equal(termIndex("Fall 2026")! - termIndex("Spring 2026")!, 1);
  const lock = lockAfterUse("Final", "Fall 2026");
  assert.equal(isLocked(lock, "Spring 2027"), true); assert.equal(isLocked(lock, "Spring 2028"), true); assert.equal(isLocked(lock, "Fall 2028"), false);
  assert.equal(lockAfterUse("Quiz", "Fall 2026"), null);
});

test("after marks: an average of 22% is too hard; discrimination top 27% vs bottom 27%; zero share", () => {
  const rows = [0.8, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0].map((item, i) => ({ item, total: 1 - i / 10 }));
  const s = itemStats(rows)!;
  assert.equal(s.avgPct, 22); assert.ok(s.flags.includes("TOO_HARD")); assert.equal(s.measured, "HARD");
  assert.ok(s.discrimination! > 0.5, `discrimination ${s.discrimination}`); assert.equal(s.zeroPct, 20);
  assert.ok(itemStats([{ item: 0.5, total: 0.9 }, { item: 0.5, total: 0.8 }, { item: 0.5, total: 0.3 }, { item: 0.5, total: 0.2 }])!.flags.includes("AMBIGUOUS"));
});

test("drafting: OMC CLO limits, only topics taught before the exam, locked questions out; version B has the same CLO and marks profile", () => {
  const bank = [
    item("a", { cloCodes: ["CLO-1"], marks: 10, lectureNumber: 3 }), item("b", { cloCodes: ["CLO-2"], marks: 10, lectureNumber: 5 }), item("c", { cloCodes: ["CLO-1"], marks: 10, lectureNumber: 20 }),
    item("d", { cloCodes: ["CLO-2"], marks: 10, lectureNumber: 6, lockedUntil: termIndex("Fall 2028") }), item("a2", { cloCodes: ["CLO-1"], marks: 10, lectureNumber: 4 }), item("b2", { cloCodes: ["CLO-2"], marks: 10, lectureNumber: 7 }),
  ];
  const o = { total: 20, minutes: 60, cloShares: { "CLO-1": 1, "CLO-2": 1 }, minCloPct: 20, maxCloPct: 60, lastTaught: 10, exclude: new Set<string>(), term: "Fall 2026" };
  const r = draftPaper(bank, o);
  assert.equal(r.check.ok, true, r.check.fails.join(" "));
  assert.ok(!r.chosen.some((q) => q.id === "c"), "lecture 20 not yet taught"); assert.ok(!r.chosen.some((q) => q.id === "d"), "locked");
  assert.deepEqual(r.check.cloPct, { "CLO-1": 50, "CLO-2": 50 });
  const v = makeVariant(r.chosen, bank, { exclude: new Set(), term: "Fall 2026", lastTaught: 10 });
  assert.deepEqual(v.missing, []); assert.equal(profile(v.chosen), profile(r.chosen));
  assert.ok(v.chosen.every((q) => !r.chosen.includes(q)), "different questions");
  const over = paperCheck([item("x", { marks: 20, cloCodes: ["CLO-1"] })], o);
  assert.equal(over.ok, false); assert.ok(over.fails.some((f) => /CLO-1 has 100%/.test(f))); assert.ok(over.fails.some((f) => /CLO-2 has 0%/.test(f)));
  assert.ok(paperCheck([item("y", { marks: 20, lectureNumber: 12 })], { ...o, cloShares: { "CLO-1": 1 }, maxCloPct: 100 }).fails.some((f) => /not taught before the exam/.test(f)));
});

test("Excel sheet: preview reports errors by row; MCQ options and parts read", () => {
  const grid = [
    ["Question", "Type", "Parts", "CLO", "Bloom", "Difficulty", "Marks", "Topic", "Answer", "Source"],
    ["Which is LIFO?\na) Queue\nb) Stack", "MCQ", "", "CLO-1", "C1", "Easy", "1", "L1", "b", "Own"],
    ["Explain stacks.", "LONG", "a) define [CLO-1, 4]; b) example [CLO-2, 6]", "CLO-1", "C2", "Medium", "10", "Stacks", "…", "Final Fall 2025"],
    ["Bad one", "ESSAY", "", "CLO-9", "C9", "Very", "", "Nowhere", "", ""],
  ];
  const r = parseSheet(grid, { clos: ["CLO-1", "CLO-2"], lectures: [{ lectureNumber: 1, topic: "Stacks" }] });
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0].options, ["Queue", "Stack"]); assert.deepEqual(r.rows[0].correct, [1]); assert.equal(r.rows[0].text, "Which is LIFO?");
  assert.equal(r.rows[1].parts.length, 2); assert.equal(r.rows[1].parts[1].cloCode, "CLO-2"); assert.equal(r.rows[1].lectureNumber, 1);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /^Row 4: type "ESSAY".*no marks; CLO-9 does not exist; Bloom level "C9".*topic "Nowhere" is not in the lecture plan/);
});

test("splitting a typed paper; scanned detection; Bloom from the verb; numerical tolerance; equations", () => {
  const t = "Q1. Define a stack and give one use. (5 marks)\nQ2. Compare arrays and linked lists.\n(a) for insertion [4]\n(b) for search [6]\nQ3. Design a queue using two stacks. 10 marks";
  const s = splitPaper(t);
  assert.equal(s.length, 3); assert.equal(s[0].marks, 5); assert.equal(s[0].text, "Define a stack and give one use.");
  assert.equal(s[1].parts.length, 2); assert.equal(s[1].marks, 10); assert.equal(s[2].marks, 10);
  assert.equal(bloomOf(s[0].text), "C1"); assert.equal(bloomOf(s[1].text), "C4"); assert.equal(bloomOf(s[2].text), "C6");
  assert.equal(looksScanned("", 3), true); assert.equal(looksScanned(t.repeat(3), 1), false);
  assert.equal(numericCorrect("3.14", 3.1416, 0.01, "ABS"), true); assert.equal(numericCorrect("3.2", 3.1416, 0.01, "ABS"), false);
  assert.equal(numericCorrect("102", 100, 2, "PCT"), true); assert.equal(numericCorrect("", 0, 1, "ABS"), false);
  assert.deepEqual(mathSegments("Find $x^2$ and $$\\int_0^1 x\\,dx$$").map((x) => [x.math, x.display, x.text]), [[false, false, "Find "], [true, false, "x^2"], [false, false, " and "], [true, true, "\\int_0^1 x\\,dx"]]);
});

test("bank readiness: fewer than 3 approved per CLO per Bloom level used is a shortfall", () => {
  const short = readiness([item("1"), item("2"), item("3", { status: "DRAFT" })], [{ clo: "CLO-1", bloom: "C2" }]);
  assert.deepEqual(short, [{ clo: "CLO-1", bloom: "C2", have: 2 }]);
});
