import test from "node:test";
import assert from "node:assert/strict";
import { draw, orderFor, autoMark, score, onEvent, eventLine, sebOk, sebHash, configKeyOf, sebSettings, plist, isPhone, DEFAULT_SETTINGS, type BankQ } from "../lib/quizCore";

const q = (id: string, o: Partial<BankQ> = {}): BankQ => ({ id, type: "MCQ", cloCodes: ["CLO-1"], bloom: "C2", difficulty: "MEDIUM", marks: 1, options: ["a", "b", "c", "d"], correct: [1], numericAnswer: null, tolerance: null, tolMode: null, ...o });
const bank = Array.from({ length: 12 }, (_, i) => q(`q${i}`, { cloCodes: [i < 6 ? "CLO-1" : "CLO-2"], difficulty: i % 2 ? "HARD" : "EASY" }));

test("two students get different questions and option orders; the same student gets the same order again", () => {
  const rules = [{ clo: "CLO-1", count: 3 }, { clo: "CLO-2", difficulty: "HARD", count: 2 }];
  const a = draw(bank, { rules }, "quiz|A|1"), b = draw(bank, { rules }, "quiz|B|1");
  assert.equal(a.ids.length, 5); assert.deepEqual(a.short, []);
  assert.ok(a.ids.slice(3).every((id) => Number(id.slice(1)) >= 6 && Number(id.slice(1)) % 2 === 1), "CLO-2 hard ones");
  const oa = orderFor(a.ids, bank, DEFAULT_SETTINGS, "quiz|A|1"), ob = orderFor(b.ids, bank, DEFAULT_SETTINGS, "quiz|B|1");
  assert.notDeepEqual([oa.questions, oa.options], [ob.questions, ob.options]);
  assert.deepEqual(orderFor(a.ids, bank, DEFAULT_SETTINGS, "quiz|A|1"), oa, "stable for the same student");
  assert.equal(draw(bank, { rules: [{ clo: "CLO-1", count: 9 }] }, "x").short[0], "CLO-1: 6 of 9");
});

test("a make-up draws different questions by the same rules", () => {
  const rules = [{ clo: "CLO-1", count: 3 }];
  const first = draw(bank, { rules }, "s1");
  const mk = draw(bank, { rules }, "s2", new Set(first.ids));
  assert.equal(mk.ids.length, 3); assert.ok(mk.ids.every((id) => !first.ids.includes(id)));
});

test("marking: MCQ, several answers, true/false, numerical within tolerance; written answers wait for the teacher", () => {
  assert.equal(autoMark(q("a"), 1), 1); assert.equal(autoMark(q("a"), 2), 0); assert.equal(autoMark(q("a"), undefined), 0);
  assert.equal(autoMark(q("m", { type: "MCQ_MULTI", correct: [0, 2], marks: 2 }), [2, 0]), 2); assert.equal(autoMark(q("m", { type: "MCQ_MULTI", correct: [0, 2], marks: 2 }), [0]), 0);
  assert.equal(autoMark(q("t", { type: "TRUE_FALSE", correct: [1] }), 1), 1);
  const n = q("n", { type: "NUMERICAL", numericAnswer: 9.81, tolerance: 1, tolMode: "PCT", marks: 2 });
  assert.equal(autoMark(n, "9.75"), 2); assert.equal(autoMark(n, "9.5"), 0);
  const w = q("w", { type: "SHORT", marks: 4 });
  assert.equal(autoMark(w, "text"), null);
  const s = score([q("a"), w], { a: 1, w: "x" });
  assert.equal(s.score, 1); assert.equal(s.max, 5); assert.equal(s.pending, 1);
  assert.equal(score([q("a"), w], { a: 1 }, { w: 3 }).score, 4);
  assert.deepEqual(score([q("a"), q("b", { cloCodes: ["CLO-2"] })], { a: 1, b: 0 }).perClo, { "CLO-1": [1, 1], "CLO-2": [0, 1] });
});

test("leaving the quiz: warn, then submit on the 3rd (default); flag only; the monitor line", () => {
  assert.equal(onEvent("AUTO", 3, 1), "WARN"); assert.equal(onEvent("AUTO", 3, 2), "WARN"); assert.equal(onEvent("AUTO", 3, 3), "SUBMIT");
  assert.equal(onEvent("FLAG", 3, 5), "FLAG"); assert.equal(onEvent("WARN", 3, 9), "WARN");
  const t = new Date("2026-11-01T05:05:00Z"), t2 = new Date("2026-11-01T05:07:00Z");
  assert.equal(eventLine("Ali", [{ kind: "FULLSCREEN_EXIT", at: t, awayMs: 25000 }, { kind: "TAB_HIDDEN", at: t2, awayMs: 15000 }, { kind: "CONNECTION_LOST", at: t2, awayMs: 120000 }]), "Ali left 2× — 10:05, 10:07, 40 s");
});

test("Safe Exam Browser: the right config key passes, a normal browser fails; the .seb file; phones", () => {
  const settings = sebSettings("https://x.test/student/quizzes/q1", "https://x.test/student/quizzes");
  const key = configKeyOf(settings);
  assert.equal(key, configKeyOf({ ...settings }), "stable");
  const url = "https://x.test/student/quizzes/q1";
  assert.equal(sebOk(url, { configHash: sebHash(url, key) }, { configKey: key, browserKey: null }), true);
  assert.equal(sebOk(url, { configHash: null }, { configKey: key, browserKey: null }), false);
  assert.equal(sebOk(url, { configHash: sebHash(url, "other") }, { configKey: key, browserKey: null }), false);
  assert.match(plist(settings), /<key>startURL<\/key>\s*<string>https:\/\/x.test\/student\/quizzes\/q1<\/string>/);
  assert.equal(isPhone("Mozilla/5.0 (Linux; Android 14) Mobile Safari"), true); assert.equal(isPhone("Mozilla/5.0 (Windows NT 10.0) Chrome/120"), false);
});
