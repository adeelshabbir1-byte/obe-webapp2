import { test } from "node:test";
import assert from "node:assert/strict";
import { jobForField, jobForMove, may } from "../lib/affJobsCore";

test("each step has its job", () => {
  assert.equal(jobForMove("APPLICATION", "SCRUTINY"), "OFFICE");
  assert.equal(jobForMove("APPLICATION", "INSPECTED"), "INSPECTOR");
  assert.equal(jobForMove("APPLICATION", "RECOMMENDED"), "COMMITTEE");
  assert.equal(jobForMove("APPLICATION", "APPROVED"), "AUTHORITY");
  assert.equal(jobForMove("CLAIM", "VERIFIED"), "CONTROLLER");
  assert.equal(jobForMove("CLAIM", "PAID"), "TREASURER");
  assert.equal(jobForMove("SESSION", "HELD"), "CONTROLLER");
  assert.equal(jobForField("APPLICATION", "score"), "INSPECTOR");
});
test("only holders (or the head) may act; empty jobs fall back", () => {
  const jobs = { TREASURER: [{ userId: "t", name: "T" }] };
  assert.ok(may("TREASURER", { id: "t", role: "INSTRUCTOR" }, jobs, false));
  assert.ok(!may("TREASURER", { id: "d", role: "DEAN" }, jobs, true));
  assert.ok(may("TREASURER", { id: "h", role: "CHAIRMAN" }, jobs, false));
  assert.ok(may("REGISTRAR", { id: "d", role: "DEAN" }, jobs, true));
  assert.ok(!may("REGISTRAR", { id: "x", role: "INSTRUCTOR" }, jobs, false));
  assert.ok(may("CONTROLLER", { id: "c", role: "INSTRUCTOR", extraRoles: ["EXAM_CONTROLLER"] }, {}, false));
});
