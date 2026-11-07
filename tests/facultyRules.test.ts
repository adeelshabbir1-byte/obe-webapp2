import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, defaultDegree, nceacChecks, NCEAC_DEFAULT as R, parseDegree, parseEmployment, versionFor, type Person } from "../lib/facultyRulesCore";

const p = (o: Partial<Person>): Person => ({ id: o.name || "x", name: "x", degree: "MS", employment: "PERMANENT", admin: false, inProgTerm: 9, inProgYear: 18, allTerm: 9, allYear: 18, yearKnown: true, ...o });
test("defaults: Dr = PhD, lab engineer = BS, others MS; parsing (item 23)", () => {
  assert.equal(defaultDegree("Dr. Ayesha Khan", "INSTRUCTOR"), "PHD");
  assert.equal(defaultDegree("Prof. Dr Ali", "SUBJECT_EXPERT"), "PHD");
  assert.equal(defaultDegree("Drake Ahmed", "INSTRUCTOR"), "MS");
  assert.equal(defaultDegree("Bilal", "LAB_ENGINEER"), "BS");
  assert.equal(parseDegree("MPhil Computer Science"), "MS");
  assert.equal(parseDegree("PhD (CS)"), "PHD");
  assert.equal(parseDegree("BS Software Engineering"), "BS");
  assert.equal(parseEmployment("Visiting", "INSTRUCTOR"), "VISITING");
  assert.equal(parseEmployment("", "LAB_ENGINEER"), "LAB_ENGINEER");
});
test("NCEAC §3.2.5: classes, visiting 0.25 capped at 1, load limits", () => {
  assert.equal(classify(p({}), R).klass, "DEDICATED");
  assert.equal(classify(p({ inProgYear: 3, inProgTerm: 3 }), R).klass, "SHARED");
  assert.equal(classify(p({ employment: "VISITING" }), R).fte, 0.25);
  assert.equal(classify(p({ degree: "BS" }), R).klass, "DEMONSTRATOR");
  assert.equal(classify(p({ allTerm: 12 }), R).overLoad, true);
  assert.equal(classify(p({ yearKnown: false, inProgTerm: 6, allTerm: 6 }), R).klass, "DEDICATED"); // one term known: doubled
  assert.equal(classify(p({ admin: true, inProgYear: 6, allYear: 6, inProgTerm: 3, allTerm: 3 }), R).underLoad, false);
  const rows = [p({ name: "a", degree: "PHD" }), ...["b", "c", "d", "e", "f"].map((n) => p({ name: n })), p({ name: "g", degree: "BS" }), p({ name: "h", degree: "BS" }), p({ name: "i", degree: "BS" }), ...["v1", "v2", "v3", "v4", "v5"].map((n) => p({ name: n, employment: "VISITING" }))].map((x) => classify(x, R));
  const n = nceacChecks(rows, R, 4, 48);
  assert.equal(n.counted, 8); // 6 dedicated + at most 2 demonstrators
  assert.equal(n.visiting, 1); // five visiting = 1.25, capped at 1
  assert.ok(n.checks.find((c) => c.label.startsWith("Dedicated full-time"))!.ok);
  assert.equal(n.checks.find((c) => c.label.startsWith("Demonstrators"))!.ok, false);
  assert.equal(nceacChecks(rows.filter((r) => r.degree !== "PHD"), R, 4, 48).checks.find((c) => c.label.includes("PhD"))!.ok, false);
  assert.equal(nceacChecks(rows, R, 2, 48).need, 4);
});
test("requirement versions apply from their term", () => {
  const v = [{ id: "1", body: "NCEAC", label: "2026", fromTerm: "Fall", fromYear: 2026, rules: { minDedicated: 8 } }];
  assert.equal(versionFor("NCEAC", v, "Spring", 2026).rules.minDedicated, 7);
  assert.equal(versionFor("NCEAC", v, "Fall", 2026).rules.minDedicated, 8);
  assert.equal(versionFor("NCEAC", v, "Spring", 2027).rules.maxLoadTerm, 9);
});
