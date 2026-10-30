import test from "node:test";
import assert from "node:assert/strict";
import { applyItems, intentItems, itemLine } from "../lib/topicPlanCore";
import { mapByText, parseToc, readingOf } from "../lib/bookChapters";

// Prompt 10 A: proposals recorded by intent (a merge is a MERGE, a split a SPLIT), and topics mapped to book chapters.
const r = (id: string, topic: string) => ({ id, topic, subtopic: null });

test("a merge is recorded as MERGE (\"Merged L2 + L3 → L2\"), not as a rename and a removal", () => {
  const before = [r("a", "Intro"), r("b", "Arrays"), r("c", "Strings"), r("d", "Loops")];
  const after = [{ id: "a", topic: "Intro", subtopic: null }, { id: "b", topic: "Arrays; Strings", subtopic: null, mergedFrom: ["b", "c"] }, { id: "d", topic: "Loops", subtopic: null }];
  const items = intentItems(before, after);
  assert.deepEqual(items.map((i) => i.kind), ["MERGE"]);
  assert.equal(itemLine(items[0]), 'Merged L2 + L3 → L2: "Arrays; Strings"');
  assert.deepEqual(applyItems(before, items).map((e) => e.topic), ["Intro", "Arrays; Strings", "Loops"]);
});

test("a split is recorded as SPLIT and applies as the parts", () => {
  const before = [r("a", "Intro"), r("b", "Sorting")];
  const after = [{ id: "a", topic: "Intro", subtopic: null }, { id: "b", topic: "Sorting (part 1)", subtopic: null }, { topic: "Sorting (part 2)", subtopic: null, splitFrom: "b" }];
  const items = intentItems(before, after);
  assert.deepEqual(items.map((i) => i.kind), ["SPLIT"]);
  assert.match(itemLine(items[0]), /^Split L2 "Sorting" into 2/);
  assert.deepEqual(applyItems(before, items).map((e) => e.topic), ["Intro", "Sorting (part 1)", "Sorting (part 2)"]);
});

test("other changes still come through: added, removed, renamed, with their lecture numbers", () => {
  const before = [r("a", "Intro"), r("b", "Arrays"), r("c", "Strings")];
  const after = [{ id: "a", topic: "Introduction", subtopic: null }, { id: "c", topic: "Strings", subtopic: null }, { topic: "Pointers", subtopic: null }];
  const kinds = intentItems(before, after).map((i) => `${i.kind}${i.detail.lecture ? `:L${i.detail.lecture}` : ""}`).sort();
  assert.deepEqual(kinds, ["ADD", "REMOVE:L2", "RENAME:L1"]);
});

test("book contents: parsed from pasted lines; topics mapped to sections; no match is flagged", () => {
  const toc = parseToc("Chapter 3 Lists 80-111\n4.2 Linked Lists ........ 112-130\n4.3 Stacks and Queues 131-150\n7 Hashing 200");
  assert.equal(toc.length, 4);
  assert.equal(readingOf(toc[1]), "Ch 4.2, p. 112–130");
  const m = mapByText(["Singly linked list", "Queue implementation", "Graph colouring"], toc);
  assert.equal(m[0].entry?.sec, "4.2");
  assert.equal(m[1].entry?.sec, "4.3");
  assert.equal(m[2].entry, null);
});
