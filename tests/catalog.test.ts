import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "../lib/catalogSeed";
import { findOverlaps, highlight, isGeneric, searchCatalog, topicSimilarity, type CatLecture, type CatalogEntry } from "../lib/catalogCore";

// Prompt 10 B: the Course Catalog.
const all = buildCatalog();

test("three catalogs, unique professional codes (prefix-level-area-serial)", () => {
  for (const f of ["COMPUTING", "MANAGEMENT", "ENGINEERING"]) assert.ok(all.filter((e) => e.field === f).length >= 15, f);
  const codes = all.map((e) => e.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const e of all) { assert.match(e.code, /^(CMP|MGS|EGR)-\d{3,4}$/); assert.equal(e.code.slice(4, 5), String(e.level)); assert.equal(e.code.slice(5, 6), String(e.area)); }
});

test("every course has GAs, CLOs, a 32-lecture plan, topic→CLO, importance, prerequisites and a semester", () => {
  for (const e of all) {
    assert.ok(e.clos.length >= 3, `${e.code} CLOs`);
    for (const c of e.clos) { assert.ok(c.gas.length > 0, `${e.code} CLO-${c.n} GA`); assert.match(c.bloom, /^[CPA][1-7]$/); }
    assert.equal(e.lectures.length, 32, `${e.code} lectures`);
    for (const l of e.lectures) {
      assert.ok(l.topic.trim() && l.sub.trim(), `${e.code} L${l.n} topic/sub-topic`);
      assert.ok(["CORE", "IMPORTANT", "OPTIONAL"].includes(l.importance));
      if (!isGeneric(l.topic)) assert.ok(l.clo && e.clos.some((c) => c.n === l.clo), `${e.code} L${l.n} → CLO`);
    }
    assert.ok(Array.isArray(e.prereqs));
    for (const p of e.prereqs) assert.ok(["STRONG", "MILD", "WEAK"].includes(p.strength) && p.reason);
    assert.ok(e.semester && e.semesterReason, `${e.code} semester`);
    assert.ok(e.source, `${e.code} source`);
  }
  // Council prerequisites resolve to catalog courses, with topic links marked PR.
  const ds = all.find((e) => e.title === "Data Structures")!;
  assert.equal(ds.prereqs[0].code, all.find((e) => e.title === "Programming Fundamentals")!.code);
  assert.ok(ds.lectures.some((l) => l.pr?.startsWith("PR:")));
  // Nothing OBEHUB wrote is passed off as council text.
  for (const e of all.filter((x) => x.field !== "COMPUTING")) assert.equal(e.source, "OBEHUB reference");
});

test("search finds by code, title, topic, CLO and book, and says which field matched", () => {
  const byTopic = searchCatalog(all, "linked list");
  const ds = byTopic.find((h) => h.entry.title === "Data Structures");
  assert.ok(ds && ds.matches.some((m) => m.field === "topic"), "topic match");
  const byCode = searchCatalog(all, all[0].code);
  assert.equal(byCode[0].entry.code, all[0].code);
  assert.equal(byCode[0].matches[0].field, "code");
  assert.ok(searchCatalog(all, "Kotler")[0].matches.some((m) => m.field === "book"));
  assert.ok(searchCatalog(all, "double entry").some((h) => h.matches.some((m) => m.field === "clo")));
  assert.ok(searchCatalog(all, "", { field: "ENGINEERING", hasPrereq: true }).every((h) => h.entry.field === "ENGINEERING" && h.entry.prereqs.length));
  const parts = highlight("Singly Linked List", "linked list");
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.t), ["Linked", "List"]);
});

const lec = (n: number, topic: string, sub = ""): CatLecture => ({ n, topic, sub, clo: 1, importance: "IMPORTANT", chapter: null, pr: null });
const course = (code: string, sem: number, topics: string[], pre: string[] = []) => ({ code, title: code, semester: sem, prereqs: pre.map((p) => ({ code: p, title: p, strength: "STRONG" as const, reason: "" })), lectures: topics.map((t, i) => lec(i + 1, t)) }) as unknown as CatalogEntry;

test("“Review” lectures never create overlaps (and the stop-list is honoured)", () => {
  const generic = ["Review", "Revision", "Recap", "Course review", "Mid-term review", "Introduction to the course", "Final review", "Midterm exam", "Final Project Presentation"];
  for (const g of generic) assert.ok(isGeneric(g), g);
  const a = course("CMP-111", 1, [...generic, "Weekly lab clinic"]), b = course("CMP-211", 3, [...generic, "Weekly lab clinic"]);
  assert.equal(findOverlaps([a, b], ["Weekly lab clinic"]).length, 0);
  assert.equal(findOverlaps([a, b]).length, 1, "only the non-generic topic, until it is stop-listed");
});

test("“Linked lists” and “Singly linked list” (and “List ADT”) are found as an overlap", () => {
  assert.ok(topicSimilarity("Linked lists", "Singly linked list") >= 0.75);
  assert.ok(topicSimilarity("Linked lists", "Singly and doubly linked lists") >= 0.75);
  assert.ok(topicSimilarity("List ADT", "Linked lists") >= 0.75);
  assert.equal(topicSimilarity("Stacks - Implementation", "Queues - Implementation"), 0);
  const pf = course("CMP-111", 1, ["Linked lists"]), ds = course("CMP-251", 3, ["Singly linked list"], ["CMP-111"]);
  const linked = findOverlaps([pf, ds]);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].kind, "PROGRESSION");
  assert.match(linked[0].reason, /prerequisite/);
  const unlinked = findOverlaps([course("CMP-111", 1, ["Linked lists"]), course("CMP-252", 1, ["Linked lists"])]);
  assert.equal(unlinked[0].kind, "DUPLICATION");
  // In the real catalog: both kinds are found, and no generic lecture is ever part of one.
  const real = findOverlaps(all);
  assert.ok(real.some((o) => o.kind === "PROGRESSION") && real.some((o) => o.kind === "DUPLICATION"));
  assert.ok(real.every((o) => !isGeneric(o.a.topic) && !isGeneric(o.b.topic)));
});
