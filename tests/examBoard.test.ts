import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BLUEPRINT, avgStars, blueprintCheck, consensus, deriveSlots, duplicates, mappingTable, questionSimilarity, ratingError, type BQ, type Candidate } from "../lib/examBoardCore";

const q = (id: string, clo: string, difficulty: BQ["difficulty"], marks: number, extra: Partial<BQ> = {}): BQ => ({ id, text: `Question ${id}`, marks, kind: "SHORT", difficulty, cloCodes: [clo], bloom: "C3", lectureNumber: 1, week: 1, topic: "Classes", authorId: "t1", ...extra });

test("near-duplicates by meaning: synonyms, stems and word order", () => {
  const a = "Explain the difference between a linked list and an array with an example of insertion.";
  assert.ok(questionSimilarity(a, "With an example of inserting, explain how an array differs from a linked-list.") >= 0.7);
  assert.ok(questionSimilarity(a, "Write a program that sorts integers using quicksort and analyse its running time.") < 0.3);
  assert.equal(questionSimilarity("Define OOP.", "define oop"), 1, "word for word");
  assert.equal(questionSimilarity("Define OOP.", "Define inheritance."), 0, "short questions need to be the same");
  assert.equal(duplicates(a, [{ id: "x", text: "Explain the difference between an array and a linked list, with an insertion example." }, { id: "y", text: "What is a stack?" }])[0].id, "x");
});

test("blueprint: difficulty ratio within tolerance, CLO spread, OMC minimum, midterm topics", () => {
  const good = [q("1", "CLO-1", "EASY", 4), q("2", "CLO-1", "MEDIUM", 6), q("3", "CLO-2", "MEDIUM", 6), q("4", "CLO-2", "HARD", 4)];
  const ok = blueprintCheck(good, DEFAULT_BLUEPRINT, { requiredClos: ["CLO-1", "CLO-2"], examType: "Final" });
  assert.equal(ok.ok, true, ok.fails.join(" "));
  assert.deepEqual(ok.mix, { EASY: 20, MEDIUM: 60, HARD: 20 });
  const hard = blueprintCheck([q("1", "CLO-1", "HARD", 10), q("2", "CLO-2", "MEDIUM", 10)], DEFAULT_BLUEPRINT, { requiredClos: ["CLO-1", "CLO-2"], examType: "Final" });
  assert.ok(hard.fails.some((f) => /Hard questions carry 50%/.test(f)));
  assert.ok(hard.fails.some((f) => /Easy questions carry 0%/.test(f)));
  const missing = blueprintCheck(good.map((x) => ({ ...x, cloCodes: ["CLO-1"] })), DEFAULT_BLUEPRINT, { requiredClos: ["CLO-1", "CLO-3"], examType: "Final" });
  assert.ok(missing.fails.some((f) => /CLO-3 is taught .* not assessed/.test(f)));
  const heavy = blueprintCheck([q("1", "CLO-1", "EASY", 4), q("2", "CLO-1", "MEDIUM", 12), q("3", "CLO-2", "HARD", 4)], DEFAULT_BLUEPRINT, { requiredClos: [], examType: "Final" });
  assert.ok(heavy.fails.some((f) => /CLO-1 carries 80%.*at most 50/.test(f)));
  assert.ok(blueprintCheck(good, DEFAULT_BLUEPRINT, { requiredClos: [], minQuestions: 6, examType: "Final" }).fails.some((f) => /at least 6 questions/.test(f)));
  const late = blueprintCheck(good.map((x, i) => ({ ...x, week: i === 0 ? 10 : 2 })), DEFAULT_BLUEPRINT, { requiredClos: [], examType: "Midterm", midtermWeek: 8 });
  assert.ok(late.warns[0].includes("after the midterm"));
  // A question on two CLOs shares its marks.
  const split = blueprintCheck([q("1", "CLO-1", "MEDIUM", 10, { cloCodes: ["CLO-1", "CLO-2"] })], { ...DEFAULT_BLUEPRINT, tolerancePct: 100 }, { requiredClos: [], examType: "Final" });
  assert.deepEqual(split.perClo.map((p) => p.pct), [50, 50]);
});

test("ratings: average to two decimals; 1–2 stars need a reason", () => {
  assert.equal(avgStars([5, 4, 4]), 4.33);
  assert.equal(avgStars([]), null);
  assert.match(ratingError(2, "")!, /need a reason/);
  assert.equal(ratingError(2, "Answer is wrong"), null);
  assert.match(ratingError(6, "")!, /1 to 5/);
});

test("consensus: highest average per slot, used once; equal top ratings are a tie for the Course Lead", () => {
  const c = (id: string, clo: string, avg: number | null, n = 3, lecture = 1): Candidate => ({ ...q(id, clo, "MEDIUM", 5, { lectureNumber: lecture }), avg, n });
  const cands = [c("a", "CLO-1", 4.5), c("b", "CLO-1", 4.5), c("c", "CLO-1", 3), c("d", "CLO-2", 4), c("e", "CLO-2", null, 0)];
  const slots = [{ key: "Q1", label: "", clo: "CLO-1", lectureNumber: null, marks: 10 }, { key: "Q2", label: "", clo: "CLO-2", lectureNumber: null, marks: 10 }, { key: "Q3", label: "", clo: "CLO-1", lectureNumber: null, marks: 5 }];
  const p = consensus(slots, cands, {});
  assert.equal(p[0].status, "TIE");
  assert.deepEqual(p[0].tied.sort(), ["a", "b"]);
  assert.equal(p[1].status, "AUTO");
  assert.equal(p[1].itemId, "d");
  // The Lead breaks the tie: "b" wins Q1, so Q3 gets "a" (the next best not used).
  const p2 = consensus(slots, cands, { Q1: { itemId: "b", by: "lead", at: "", kind: "TIE" } });
  assert.equal(p2[0].status, "LEAD");
  assert.equal(p2[2].itemId, "a");
  // Lecture-matched candidates first when the slot names a lecture.
  const p3 = consensus([{ key: "Q1", label: "", clo: "CLO-1", lectureNumber: 7, marks: null }], [c("x", "CLO-1", 5, 3, 1), c("y", "CLO-1", 3, 3, 7)], {});
  assert.equal(p3[0].itemId, "y");
  assert.equal(consensus([{ key: "Q1", label: "", clo: "CLO-2", lectureNumber: null, marks: null }], [c("e", "CLO-2", null, 0)], {})[0].status, "UNRATED");
  assert.equal(consensus([{ key: "Q1", label: "", clo: "CLO-9", lectureNumber: null, marks: null }], cands, {})[0].status, "EMPTY");
});

test("slots from drafts: the average number of questions per CLO; mapping table totals", () => {
  const byId = new Map([["a", { cloCodes: ["CLO-1"] }], ["b", { cloCodes: ["CLO-1"] }], ["c", { cloCodes: ["CLO-2"] }]]);
  const s = deriveSlots([["a", "b", "c"], ["a", "c"]], byId);
  assert.deepEqual(s.map((x) => x.key), ["CLO-1#1", "CLO-1#2", "CLO-2#1"]);
  const m = mappingTable([{ no: 1, id: "a", text: "", marks: 10, difficulty: "EASY", cloCodes: ["CLO-1", "CLO-2"], bloom: "C2", lectureNumber: 1, topic: "" }, { no: 2, id: "b", text: "", marks: 30, difficulty: "HARD", cloCodes: ["CLO-2"], bloom: "C4", lectureNumber: 2, topic: "" }]);
  assert.equal(m.total, 40);
  assert.deepEqual(m.perClo, [{ code: "CLO-1", marks: 5, pct: 12.5, questions: [1] }, { code: "CLO-2", marks: 35, pct: 87.5, questions: [1, 2] }]);
  assert.deepEqual(m.difficulty.map((d) => d.key), ["EASY", "HARD"]);
});
