import { test } from "node:test";
import assert from "node:assert/strict";
import { gaAverages, level } from "../lib/skillsTranscriptCore";
test("GA averages across transcript courses", () => {
  const g = gaAverages([
    { courseCode: "CS101", ploAttainmentJson: JSON.stringify([{ label: "PLO-1", pct: 80 }, { label: "PLO-3", pct: 40 }]) },
    { courseCode: "CS201", ploAttainmentJson: JSON.stringify([{ label: "PLO-1", pct: 70 }, { label: "PLO-3", pct: 60 }]) },
    { courseCode: "BAD", ploAttainmentJson: "not json" },
  ]);
  assert.deepEqual(g.map((x) => [x.number, x.pct, x.level, x.courses.length]), [[1, 75, "Good", 2], [3, 50, "Satisfactory", 2]]);
  assert.equal(level(85), "Excellent"); assert.equal(level(10), "Not yet");
});
