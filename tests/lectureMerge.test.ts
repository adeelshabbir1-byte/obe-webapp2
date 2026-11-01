import test from "node:test";
import assert from "node:assert/strict";
import { applyItems, intentItems, freeLabel, isFree, mergeWarnings, splitSubtopics, topicLoop, isDuplicateLink, linkWarnings, explainTopicDiff, changeSummary, type Entry, type Row } from "../lib/topicPlanCore";

const rows: Row[] = ["Intro", "Loops", "Functions", "Arrays", "Pointers", "Strings", "Recursion", "Recursion examples", "Sorting", "Searching"].map((t, i) => ({ id: `r${i + 1}`, topic: t, subtopic: i === 8 ? "Bubble sort; Selection sort; Merge sort; Quick sort" : null }));

test("merging L7 + L8 is one MERGE: the freed slot is a Free lecture, not removed or added", () => {
  const after: Entry[] = rows.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic }));
  after[6] = { ...after[6], topic: "Recursion; Recursion examples", mergedFrom: ["r7", "r8"] };
  after[7] = { ...after[7], topic: freeLabel([7, 8]), subtopic: null, free: freeLabel([7, 8]) };
  const items = intentItems(rows, after);
  assert.deepEqual(items.map((i) => i.kind), ["MERGE"]);
  assert.deepEqual(items[0].detail.lectures, [7, 8]);
  assert.equal(items[0].detail.into, 7);
  assert.equal(freeLabel([7, 8]), "Free — created by merging L7 + L8");
  assert.ok(isFree(after[7].topic) && !isFree("Recursion"));
});

test("accepting a merge applies it as a real merge (merged lecture + Free slot), keeping both rows", () => {
  const items = intentItems(rows, rows.map((r) => (r.id === "r7" ? { id: "r7", topic: "Recursion; Recursion examples", subtopic: null, mergedFrom: ["r7", "r8"] } : r.id === "r8" ? { id: "r8", topic: freeLabel([7, 8]), subtopic: null, free: freeLabel([7, 8]) } : { id: r.id, topic: r.topic, subtopic: r.subtopic })));
  const out = applyItems(rows, items);
  assert.equal(out.length, rows.length, "no lecture lost: the slot stays");
  const m = out.find((e) => e.id === "r7")!;
  assert.equal(m.topic, "Recursion; Recursion examples");
  assert.deepEqual(m.mergedFrom, ["r7", "r8"]);
  const f = out.find((e) => e.id === "r8")!;
  assert.ok(f.free && isFree(f.topic));
});

test("merge warnings: two Core topics, a hard topic, or history needing the time", () => {
  assert.equal(mergeWarnings({ topic: "A", importance: "IMPORTANT" }, { topic: "B", importance: "CORE" }).length, 0);
  assert.match(mergeWarnings({ topic: "A", importance: "CORE" }, { topic: "B", importance: "CORE" })[0], /Both are Core/);
  assert.match(mergeWarnings({ topic: "Pointers", hard: true }, { topic: "B" })[0], /usually hard/);
  const w = mergeWarnings({ topic: "Recursion", perf: { vsLectures: [{ lectures: 1, offerings: 2, avg: 52 }, { lectures: 2, offerings: 3, avg: 71 }] } }, { topic: "B" });
  assert.match(w[0], /Recursion: 52% average when given 1 lecture, 71% with 2/);
});

test("split: the sub-topics are shared out, the first half stays", () => {
  assert.deepEqual(splitSubtopics("Bubble sort; Selection sort; Merge sort; Quick sort"), ["Bubble sort; Selection sort", "Merge sort; Quick sort"]);
  assert.deepEqual(splitSubtopics("One topic"), ["One topic", null]);
});

test("links: loops refused with the loop named, duplicates noticed, order warnings", () => {
  const edges = [{ fromCode: "CS-101", fromTopic: "Loops", toCode: "CS-201", toTopic: "Recursion" }, { fromCode: "CS-201", fromTopic: "Recursion", toCode: "CS-301", toTopic: "Trees" }];
  const loop = topicLoop(edges, { fromCode: "CS-301", fromTopic: "Trees", toCode: "CS-101", toTopic: "Loops" });
  assert.ok(loop && loop.join(" → ").includes("Recursion"));
  assert.equal(topicLoop(edges, { fromCode: "CS-101", fromTopic: "Loops", toCode: "CS-301", toTopic: "Trees" }), null);
  assert.ok(isDuplicateLink(edges, { fromCode: "CS-101", fromTopic: "loops", toCode: "CS-201", toTopic: "Recursion" }));
  const same = linkWarnings({ code: "CS-201", topic: "Recursion", semester: 3, position: 6 }, { code: "CS-201", topic: "Loops", semester: 3, position: 1 });
  assert.ok(same?.move && /taught after/.test(same.text));
  assert.equal(linkWarnings({ code: "CS-201", topic: "Loops", semester: 3, position: 1 }, { code: "CS-201", topic: "Recursion", semester: 3, position: 6 }), null);
  assert.match(linkWarnings({ code: "CS-301", topic: "Trees", semester: 5, position: 1 }, { code: "CS-201", topic: "Recursion", semester: 3, position: 1 })!.text, /semester 5/);
});

test("compare by text: a merge and a split show as such, never as removed + added", () => {
  const then = ["Intro", "Recursion", "Recursion examples", "Sorting", "Graphs"];
  const now = ["Intro", "Recursion; Recursion examples", freeLabel([2, 3]), "Sorting (part 1)", "Sorting (part 2)", "Graphs", "Hashing"];
  const c = explainTopicDiff(then, now);
  assert.deepEqual(c.merged, [{ from: ["Recursion", "Recursion examples"], into: "Recursion; Recursion examples" }]);
  assert.deepEqual(c.split, [{ from: "Sorting", into: ["Sorting (part 1)", "Sorting (part 2)"] }]);
  assert.deepEqual(c.added, ["Hashing"]);
  assert.deepEqual(c.removed, []);
  assert.equal(changeSummary(c), "1 merged · 1 split · 1 added");
  // A recorded merge wins even when the wording was edited afterwards.
  const r = explainTopicDiff(["A", "B"], ["Combined A and B"], [{ kind: "MERGE", from: ["A", "B"], into: ["Combined A and B"] }]);
  assert.equal(r.merged.length, 1); assert.deepEqual(r.removed, []); assert.deepEqual(r.added, []);
});
