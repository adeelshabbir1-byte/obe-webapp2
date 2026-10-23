import { test } from "node:test";
import assert from "node:assert/strict";
import { similarity, checklistOf, REPEAT_AT } from "../lib/moderation";

test("repeat check: the same question reworded slightly is flagged, a different one is not", () => {
  const a = "Explain the stages of the software development life cycle with a diagram and examples of each stage";
  const b = "Explain stages of the software development life cycle, with examples of each stage and a diagram";
  const c = "Compare TCP and UDP for streaming video and justify which protocol a video call application should use";
  assert.ok(similarity(a, b) >= REPEAT_AT);
  assert.ok(similarity(a, c) < 0.2);
  assert.equal(similarity("short one", "short one"), 0); // too short to judge
});

test("vetting checklist: four checks from the system and past papers, clarity from the vetter", () => {
  const sys = JSON.stringify({ findings: [{ level: "warn", text: "CLO-2 was taught in this part of the course but is not assessed in this paper." }, { level: "warn", text: "60% of marks are recall/understanding (C1–C2); the final should test more application and analysis." }] });
  const cl = checklistOf(sys, [{ question: "Q2", past: "Final paper, BSCS Fall 2023", pastQuestion: "x", similarity: 70 }], true);
  const by = (k: string) => cl.find((x) => x.key === k)!;
  assert.equal(cl.length, 5);
  assert.equal(by("clo").ok, false);
  assert.equal(by("bloom").ok, false);
  assert.equal(by("marks").ok, true);
  assert.equal(by("repeats").ok, false);
  assert.match(by("repeats").note || "", /Q2/);
  assert.equal(by("clarity").ok, true);
  assert.equal(checklistOf(null, [], null)[0].ok, null);
});

import { pctOn, splitInvoice, HEC_SCHEDULE } from "../lib/feeRefunds";
import { bond, fiscalYear } from "../lib/fdpFunding";
import { compliance, overdue } from "../lib/committees";
import { classify, DEFAULT_RULES } from "../lib/facultySufficiency";
import { stageOf, progressOf } from "../lib/qaa";
import { overLimit } from "../lib/plagiarism";

test("fee refund: HEC schedule by day of classes, admission fee never refunded", () => {
  assert.equal(pctOn(HEC_SCHEDULE, 1), 100);
  assert.equal(pctOn(HEC_SCHEDULE, 7), 100);
  assert.equal(pctOn(HEC_SCHEDULE, 8), 50);
  assert.equal(pctOn(HEC_SCHEDULE, 15), 50);
  assert.equal(pctOn(HEC_SCHEDULE, 16), 0);
  const s = splitInvoice({ linesJson: JSON.stringify([{ label: "Admission fee", amount: 20000 }, { label: "Security deposit", amount: 10000 }, { label: "Tuition fee", amount: 120000 }]), paid: 100000 });
  assert.deepEqual(s, { nonRefundable: 20000, securityDeposit: 10000, tuitionPaid: 70000 });
});

test("bond: served share and the refund for leaving early", () => {
  const f = { id: "x", chairmanId: "c", userId: "u", kind: "STUDY_LEAVE", sponsor: "HEC", sponsorName: null, purpose: "PhD", place: null, country: null, feeAmount: 600000, stipendAmount: 400000, travelAmount: 0, otherAmount: 0, sanctionedAt: null, startDate: null, expectedReturn: null, actualReturn: new Date("2024-01-01T00:00:00Z"), bondYears: 4, status: "RETURNED", refundDue: null, refundPaid: null, notes: null };
  const b = bond(f, new Date("2026-01-01T00:00:00Z"));
  assert.equal(b.servedPct, 50);
  assert.equal(b.refund, 500000);
  assert.equal(fiscalYear(new Date("2026-07-01T00:00:00Z")), "2026-27");
  assert.equal(fiscalYear(new Date("2026-06-30T00:00:00Z")), "2025-26");
});

test("committees: harassment committee needs 3 members, a woman and a chair; cases over 30 days are flagged", () => {
  const c = { id: "1", chairmanId: "c", kind: "HARASSMENT", name: "H", policyRef: null, termStart: null, termEnd: null };
  const m = (role: string, gender: string | null) => ({ id: Math.random().toString(), committeeId: "1", userId: null, name: "x", role, gender, organisation: null, fromDate: null, toDate: null });
  assert.equal(compliance(c, [m("CHAIR", "Male"), m("MEMBER", "Male")]).ok, false);
  assert.match(compliance(c, [m("CHAIR", "Male"), m("MEMBER", "Male"), m("MEMBER", "Male")]).issues.join(), /woman/);
  assert.equal(compliance(c, [m("CHAIR", "Female"), m("MEMBER", "Male"), m("EXTERNAL", "Male")]).ok, true);
  const old = { id: "k", committeeId: "1", caseNo: "1", receivedAt: new Date(Date.now() - 40 * 864e5), category: "Verbal", status: "INQUIRY", outcome: null, notes: null, closedAt: null };
  assert.equal(overdue(c, old), true);
  assert.equal(overdue(c, { ...old, status: "CLOSED" }), false);
});

test("AQ / PQ classification from the profile", () => {
  const y = new Date().getFullYear();
  const rec = (kind: string, title: string, o: Record<string, unknown> = {}) => ({ userId: "u", kind, title, category: null, startYear: null, startMonth: null, endYear: null, endMonth: null, ...o });
  assert.equal(classify([rec("EDUCATION", "PhD Management", { endYear: y - 10 }), rec("PUBLICATION", "Paper", { startYear: y - 1 })], DEFAULT_RULES).status, "AQ");
  assert.equal(classify([rec("EDUCATION", "PhD Management", { endYear: y - 10 })], DEFAULT_RULES).status, "OTHER");
  assert.equal(classify([rec("EDUCATION", "MBA Finance"), rec("EXPERIENCE", "Bank", { category: "Industry", startYear: y - 8, endYear: y - 1 })], DEFAULT_RULES).status, "PQ");
  assert.equal(classify([rec("EDUCATION", "MBA Finance"), rec("EXPERIENCE", "Bank", { category: "Industry", startYear: y - 3, endYear: y - 1 })], DEFAULT_RULES).status, "OTHER");
});

test("QAA stage and progress; plagiarism limits", () => {
  const c = { ptFormedAt: new Date(), sarSubmittedAt: new Date(), atVisitAt: null, atReportAt: null, planApprovedAt: null, closedAt: null } as never;
  assert.equal(stageOf(c), 2);
  assert.equal(progressOf([{ status: "DONE", progressPct: 0 }, { status: "IN_PROGRESS", progressPct: 50 }] as never), 75);
  assert.equal(overLimit({ similarityPct: 18, singleSourcePct: 4, thresholdPct: 19 }), false);
  assert.equal(overLimit({ similarityPct: 18, singleSourcePct: 6, thresholdPct: 19 }), true);
  assert.equal(overLimit({ similarityPct: 19, singleSourcePct: null, thresholdPct: 19 }), true);
});
