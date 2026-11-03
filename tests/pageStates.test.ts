import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCounts } from "../lib/pageStatesCore";
test("checked states", () => {
  assert.equal(fromCounts(0, 0, "courses", "x").status, "grey");
  assert.equal(fromCounts(4, 4, "courses", "x").status, "green");
  assert.equal(fromCounts(4, 1, "courses", "need work").reason, "3 of 4 courses need work");
  assert.equal(fromCounts(4, 0, "courses", "x").status, "red");
});
