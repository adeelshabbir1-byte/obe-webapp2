import test from "node:test";
import assert from "node:assert/strict";
import { daysOf, planHours, checkPlan, type Plan } from "../lib/fdpPlanCore";
import { costOf, overBudget, versionKey, readJson, paperPrompt, planPrompt, mockReply, DEFAULT_MODELS } from "../lib/aiChecksCore";
import { lateOf, deductionsOf, taxOf, paySheet, periodRange, type LateRule, type TaxTable } from "../lib/visitingPayCore";

test("FDP: a 3-day training with per-day times adds up its hours; bad times are refused", () => {
  const p: Plan = { startDate: "2026-11-10", endDate: "2026-11-12", same: false, start: "09:00", end: "13:00", days: [{ date: "2026-11-11", start: "09:00", end: "16:00" }], provisions: { onDuty: true, tada: "Rs 5,000" } };
  assert.deepEqual(daysOf(p).map((d) => `${d.date} ${d.start}-${d.end}`), ["2026-11-10 09:00-13:00", "2026-11-11 09:00-16:00", "2026-11-12 09:00-13:00"]);
  assert.equal(planHours(p), 15);
  assert.deepEqual(checkPlan(p), []);
  assert.match(checkPlan({ ...p, endDate: "2026-11-01" })[0], /end date/);
  assert.match(checkPlan({ ...p, same: true, end: "08:00" })[0], /end time must be after/);
});

test("AI checks: cost from tokens, the monthly cap, one key per version, a readable reply, prompts from the course's data", () => {
  assert.equal(costOf("claude-haiku-5-5", 1_000_000, 0), 1);
  assert.equal(costOf("claude-opus-5-5", 1000, 1000, { "claude-opus-5-5": { inPerM: 5, outPerM: 25 } }), 0.03);
  assert.equal(overBudget(19.99, 20), false); assert.equal(overBudget(20, 20), true); assert.equal(overBudget(0, 0), true);
  assert.equal(versionKey({ a: 1, b: [2] }), versionKey({ a: 1, b: [2] })); assert.notEqual(versionKey({ a: 1 }), versionKey({ a: 2 }));
  assert.deepEqual(readJson<{ x: number }>("Here it is:\n```json\n{\"x\": 3}\n```"), { x: 3 });
  const input = { course: "CS-201 Data Structures", exam: "Final", clos: [{ code: "CLO-1", statement: "Explain stacks", bloom: "C2" }], topics: ["Stacks"], questions: [{ no: 1, text: "Define a stack.", clo: "CLO-1", bloom: "C2", marks: 10 }] };
  const pr = paperPrompt(input);
  assert.match(pr.user, /CLO-1 \(C2\): Explain stacks/); assert.match(pr.user, /Q1 \[10 marks\] claimed CLO-1 C2: Define a stack\./);
  const m = mockReply("PAPER", input);
  assert.equal(JSON.parse(m.text).questions[0].fitsClo, true);
  assert.match(planPrompt({ course: "X", clos: [], lectures: [{ n: 1, topic: "Intro", clo: null, importance: "CORE" }], assessments: [], prerequisites: [], council: [], weeks: 16 }).user, /L1 Intro → no CLO \[CORE\]/);
  assert.notEqual(DEFAULT_MODELS.PAPER, DEFAULT_MODELS.PLAN, "a cheaper model for papers, a stronger one for plans");
});

test("visiting pay: biometric 10:50 for a 10:00 class with 10 minutes' grace is late; each deduction option; tax; net pay", () => {
  assert.deepEqual(lateOf("10:00", "10:50", 10), { late: true, minutes: 50 });
  assert.equal(lateOf("10:00", "10:09", 10).late, false);
  const lines = [{ minutes: 90, lateMinutes: 50, late: true }, { minutes: 90, lateMinutes: 0, late: false }, { minutes: 90, lateMinutes: 0, late: false }];
  const r = (mode: LateRule["mode"], x: Partial<LateRule> = {}): LateRule => ({ graceMin: 10, mode, fixed: 200, pct: 50, everyN: 1, ...x });
  assert.equal(deductionsOf(lines, 1000, r("FIXED")), 200);
  assert.equal(deductionsOf(lines, 1000, r("PCT")), 750);
  assert.equal(deductionsOf(lines, 1000, r("MINUTES")), 833.33);
  assert.equal(deductionsOf(lines, 1000, r("COUNT", { everyN: 1 })), 1500);
  const tax: TaxTable = { mode: "PCT", filerPct: 10, nonFilerPct: 20, slabs: [] };
  assert.equal(taxOf(1000, tax, true), 100); assert.equal(taxOf(1000, tax, false), 200);
  const slabs: TaxTable = { mode: "SLABS", filerPct: 0, nonFilerPct: 0, slabs: [{ upTo: 50000, filerPct: 0, nonFilerPct: 5 }, { upTo: null, filerPct: 10, nonFilerPct: 20 }] };
  assert.equal(taxOf(40000, slabs, true), 0); assert.equal(taxOf(60000, slabs, true), 6000);
  // pay = verified hours × rate − deductions − tax
  const s = paySheet(lines, 1000, r("PCT"), tax, true);
  assert.equal(s.hours, 4.5); assert.equal(s.gross, 4500); assert.equal(s.deductions, 750); assert.equal(s.tax, 375); assert.equal(s.net, 3375);
  assert.equal(paySheet(lines, 1000, r("PCT"), tax, true, 10).bonus, 450, "PhD bonus");
  const [a, b] = periodRange(new Date("2026-11-15T00:00:00Z"), "WEEKS", 2, new Date("2026-11-02T00:00:00Z"));
  assert.equal(a.toISOString().slice(0, 10), "2026-11-02"); assert.equal(b.toISOString().slice(0, 10), "2026-11-15");
});
