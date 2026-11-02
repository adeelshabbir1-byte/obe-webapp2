import { test } from "node:test";
import assert from "node:assert/strict";
import { reuseGap, resting, gaStanding, weakGas, planSwaps } from "../lib/planGenCore";
import type { Item } from "../lib/qbankCore";

const q = (id: string, clo: string, marks: number, difficulty = "MEDIUM", lectureNumber: number | null = 1, topic = "T"): Item => ({ id, courseCode: "CS1", type: "SHORT", text: id, marks, cloCodes: [clo], bloom: "C3", difficulty, lectureNumber, week: null, topic, authorId: "a", status: "APPROVED", visibility: "COURSE", sharedWith: [], parts: [], minutes: null, lab: false, lockedUntil: null, usedCount: 0 });

test("reuse gap: final 3, mid 2, others 1", () => {
  assert.equal(reuseGap("Final"), 3); assert.equal(reuseGap("Midterm"), 2); assert.equal(reuseGap("Quiz"), 1); assert.equal(reuseGap("Assignment"), 1);
  const r = resting([{ itemId: "f", termLabel: "Fall 2025", examType: "Final" }, { itemId: "m", termLabel: "Fall 2025", examType: "Midterm" }, { itemId: "z", termLabel: "Spring 2026", examType: "Quiz" }, { itemId: "y", termLabel: "Fall 2026", examType: "Quiz" }], "Fall 2026");
  assert.deepEqual(Array.from(r).sort(), ["f", "y"]);
});

test("GA standing and weak GAs", () => {
  const g = gaStanding([{ code: "CLO-1", ga: "GA-1", avgPct: 80, assessed: 30 }, { code: "CLO-2", ga: "GA-3", avgPct: 40, assessed: 30 }, { code: "CLO-3", ga: "GA-3", avgPct: 42, assessed: 30 }, { code: "CLO-4", ga: null, avgPct: 50, assessed: 30 }]);
  assert.deepEqual(g.map((x) => [x.ga, x.pct]), [["GA-1", 80], ["GA-3", 41]]);
  assert.deepEqual(weakGas(g, 50).map((x) => x.ga), ["GA-3"]);
});

test("Adeel's example: Q1 moves from Topic 1 (GA-1) to Topic 3 (CLO-2 → GA-3), same marks and difficulty", () => {
  const paper = [q("q1", "CLO-1", 5, "MEDIUM", 1, "Topic 1"), q("q2", "CLO-1", 5, "HARD", 2, "Topic 2"), q("q3", "CLO-2", 5, "MEDIUM", 3, "Topic 3"), q("q4", "CLO-3", 5, "EASY", 4, "Topic 4")];
  const bank = [...paper, q("n1", "CLO-2", 5, "MEDIUM", 3, "Topic 3"), q("n2", "CLO-2", 5, "EASY", 3, "Topic 3"), q("late", "CLO-2", 5, "HARD", 9, "Topic 9")];
  const cloGa = { "CLO-1": "GA-1", "CLO-2": "GA-3", "CLO-3": "GA-2" };
  const standing = [{ ga: "GA-1", pct: 78, clos: ["CLO-1"], assessed: 30 }, { ga: "GA-2", pct: 60, clos: ["CLO-3"], assessed: 30 }, { ga: "GA-3", pct: 41, clos: ["CLO-2"], assessed: 30 }];
  const p = planSwaps(paper, bank, { cloGa, standing, weakGa: "GA-3", count: 2, exclude: new Set(), term: "Fall 2026", lastTaught: 5, minCloPct: 10, maxCloPct: 60, limits: true });
  assert.equal(p.swaps.length, 1);
  assert.deepEqual([p.swaps[0].fromId, p.swaps[0].toId, p.swaps[0].toTopic], ["q1", "n1", "Topic 3"]);
  // Moving Q4 would leave CLO-3 with 0% (OMC minimum 10%): it becomes a request to the OMC.
  assert.equal(p.needsOmc[0].fromId, "q4"); assert.equal(p.needsOmc[0].toId, "n2");
  assert.deepEqual(p.none, ["CLO-1 · 5 marks · hard"]);
});

test("a swap that breaks the OMC limits goes to the OMC", () => {
  const paper = [q("q1", "CLO-1", 10), q("q2", "CLO-2", 10)];
  const bank = [...paper, q("n1", "CLO-2", 10)];
  const p = planSwaps(paper, bank, { cloGa: { "CLO-1": "GA-1", "CLO-2": "GA-3" }, standing: [{ ga: "GA-1", pct: 80, clos: [], assessed: 1 }, { ga: "GA-3", pct: 40, clos: [], assessed: 1 }], weakGa: "GA-3", count: 1, exclude: new Set(), term: "Fall 2026", lastTaught: null, minCloPct: 20, maxCloPct: 70, limits: true });
  assert.equal(p.swaps.length, 0); assert.equal(p.needsOmc.length, 1);
});
