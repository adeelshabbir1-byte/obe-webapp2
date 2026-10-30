import test from "node:test";
import assert from "node:assert/strict";
import { canFinalise, majorityOf, tallyVotes, type CMember } from "../lib/committeeCore";
import { majority, tally } from "../lib/omcMembers";

// The committee engine: the OMC's rules give the same results as before; the BOS needs a quorum and a majority.
const M = (n: number): CMember[] => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `M${i}` }));

test("OMC majority rule unchanged: more than half of all members", () => {
  assert.equal(majority(5), 3); assert.equal(majority(4), 3); assert.equal(majority(1), 1); assert.equal(majorityOf(0), 1);
  const five = M(5);
  const t = tally(five, [{ memberId: "m0", yes: true }, { memberId: "m1", yes: true }, { memberId: "m2", yes: false }]);
  assert.deepEqual({ yes: t.yes, no: t.no, need: t.need, carried: t.carried, failed: t.failed, waiting: t.waiting }, { yes: 2, no: 1, need: 3, carried: false, failed: false, waiting: ["M3", "M4"] });
  assert.equal(tally(five, [0, 1, 2].map((i) => ({ memberId: `m${i}`, yes: true }))).carried, true);
  assert.equal(tally(five, [0, 1, 2].map((i) => ({ memberId: `m${i}`, yes: false }))).failed, true);
  assert.equal(tally(five, [{ memberId: "stranger", yes: true }]).yes, 0, "non-members don't count");
});

test("OMC request rule unchanged: 2 approvals approve, 2 rejections reject", () => {
  const voters = M(2);
  const r = (v: ("APPROVE" | "REJECT")[]) => tallyVotes(voters, v.map((x, i) => ({ memberId: `m${i}`, vote: x })), { kind: "FIXED", need: 2 });
  assert.equal(r(["APPROVE"]).carried, false);
  assert.equal(r(["APPROVE", "APPROVE"]).carried, true);
  assert.equal(r(["REJECT", "REJECT"]).failed, true);
});

test("BOS full committee: quorum, then a majority of votes cast; the Convener follows it", () => {
  const six = M(6), rule = { kind: "QUORUM" as const, quorumPct: 50, majorityPct: 50 };
  const two = tallyVotes(six, [{ memberId: "m0", vote: "APPROVE" }, { memberId: "m1", vote: "APPROVE" }], rule);
  assert.equal(two.quorum, 3); assert.equal(two.quorumMet, false);
  assert.match(canFinalise("FULL", two, "APPROVED")!, /No quorum/);
  const split = tallyVotes(six, [{ memberId: "m0", vote: "APPROVE" }, { memberId: "m1", vote: "REJECT" }, { memberId: "m2", vote: "APPROVE_WITH_CHANGES" }, { memberId: "m3", vote: "REJECT" }], rule);
  assert.equal(split.quorumMet, true); assert.equal(split.carried, false, "2 of 4 is not more than half");
  assert.match(canFinalise("FULL", split, "APPROVED")!, /No majority/);
  assert.equal(canFinalise("FULL", split, "DEFERRED"), null);
  const ok = tallyVotes(six, [{ memberId: "m0", vote: "APPROVE" }, { memberId: "m1", vote: "APPROVE_WITH_CHANGES" }, { memberId: "m2", vote: "APPROVE_WITH_CHANGES" }, { memberId: "m3", vote: "REJECT" }], rule);
  assert.equal(ok.carried, true); assert.equal(ok.suggested, "APPROVED_WITH_CHANGES");
  assert.equal(canFinalise("FULL", ok, "APPROVED_WITH_CHANGES"), null);
  assert.match(canFinalise("FULL", ok, "REJECTED")!, /not rejected/);
  // Attendance counts towards the quorum.
  assert.equal(tallyVotes(six, [{ memberId: "m0", vote: "APPROVE" }], rule, ["m0", "m1", "m2"]).quorumMet, true);
});

test("Convener-only: any decision, no votes needed", () => {
  assert.equal(canFinalise("CONVENER_ONLY", null, "APPROVED"), null);
  assert.equal(canFinalise("CONVENER_ONLY", null, "REJECTED"), null);
});
