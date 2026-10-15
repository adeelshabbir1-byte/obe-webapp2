import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { cutoffsOf, DEFAULT_CUTOFFS, DEFAULT_MILESTONES, DEFAULT_RUBRIC, letterFor, newExternalToken, onlyRoleGaps, type StudentResult } from "../lib/fyp";

test("FYP grade letters follow the cycle's cut-offs, whatever order they are stored in", () => {
  const cut = [{ letter: "C", minPct: 60 }, { letter: "A", minPct: 85 }, { letter: "F", minPct: 0 }, { letter: "B", minPct: 70 }];
  assert.equal(letterFor(85, cut), "A");
  assert.equal(letterFor(84.9, cut), "B");
  assert.equal(letterFor(70, cut), "B");
  assert.equal(letterFor(60, cut), "C");
  assert.equal(letterFor(59.9, cut), "F");
  assert.equal(letterFor(-1, cut), "F");
});

test("broken or empty cut-off JSON falls back to the defaults", () => {
  assert.deepEqual(cutoffsOf({ cutoffsJson: "not json" }), DEFAULT_CUTOFFS);
  assert.deepEqual(cutoffsOf({ cutoffsJson: "[]" }), DEFAULT_CUTOFFS);
  assert.deepEqual(cutoffsOf({ cutoffsJson: JSON.stringify([{ letter: "P", minPct: 50 }]) }), [{ letter: "P", minPct: 50 }]);
});

test("default milestones weigh 100% and every default criterion maps to a Bloom level and a PLO", () => {
  assert.equal(DEFAULT_MILESTONES.reduce((n, m) => n + m.weightPct, 0), 100);
  assert.ok(DEFAULT_MILESTONES.some((m) => m.kind === "THESIS" && m.weightPct === 0), "the camera-ready thesis is a deadline only");
  for (const c of DEFAULT_RUBRIC) {
    assert.match(c.bloomLevel, /^[CPA][1-6]$/);
    assert.ok(c.ploNumber >= 1 && c.ploNumber <= 12);
  }
  assert.ok(DEFAULT_RUBRIC.some((c) => c.appliesTo === "GROUP") && DEFAULT_RUBRIC.some((c) => c.appliesTo === "INDIVIDUAL"), "both group and individual scores");
});

test("role gaps: every milestone scored but an evaluator role missing", () => {
  const row = (pcts: (number | null)[], complete = false): StudentResult => ({
    studentId: "s", name: "S", rollNumber: "r", groupId: "g", groupName: "G", totalPct: null, complete, grade: null, plo: [], missing: [],
    byMilestone: pcts.map((pct, i) => ({ milestoneId: String(i), title: `M${i}`, weightPct: 50, pct, byRole: {} })),
  });
  assert.equal(onlyRoleGaps(row([70, 80])), true);
  assert.equal(onlyRoleGaps(row([70, null])), false, "a milestone with no score at all is not a role gap");
  assert.equal(onlyRoleGaps(row([70, 80], true)), false, "complete evaluations are not gaps");
  assert.equal(onlyRoleGaps(row([])), false);
});

test("external evaluator links: 48 hex characters, only the SHA-256 hash is kept", () => {
  const a = newExternalToken(), b = newExternalToken();
  assert.match(a.raw, /^[a-f0-9]{48}$/);
  assert.notEqual(a.raw, b.raw);
  assert.equal(a.hash, crypto.createHash("sha256").update(a.raw).digest("hex"));
  assert.notEqual(a.hash, a.raw);
});
