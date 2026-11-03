import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLists, changes } from "../lib/curriculumDiffCore";
test("CLO / topic differences", () => {
  const d = diffLists(["Explain stacks.", "Apply queues", "Analyse trees"], ["explain  stacks", "Design hash tables", "Analyse trees", "Use graphs"]);
  assert.equal(d.same, 2);
  assert.deepEqual(d.changed, [{ from: "Apply queues", to: "Design hash tables" }]);
  assert.deepEqual(d.added, ["Use graphs"]);
  assert.equal(changes(diffLists(["A"], ["A"])), 0);
});
