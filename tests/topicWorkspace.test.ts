import test from "node:test";
import assert from "node:assert/strict";
import {
  applyItems, bankCoverage, bloomDrops, calendarCheck, chainOf, coreNotAssessed, councilCoverage, diffPlan, dropSafety, findCycle,
  gaReach, labVsTheory, lecturesVsResults, linkSteps, loopText, mergeLayouts, missingPrereqs, perfSummary, prefillImportance,
  sectionCompare, shortOfTime, suggestImportance, textLinkSuggestions, timeBudget, followUpAction, orderSuggestions,
  type CoursePlan, type TopicFacts,
} from "../lib/topicPlanCore";

// Topic Workspace rules: plan differences, linked moves, importance, drop-safety, short of time, checks, merging two
// saves, the chain of courses, topic performance and suggestions without AI.

const row = (id: string, topic: string) => ({ id, topic, subtopic: null });
const facts = (p: Partial<TopicFacts>): TopicFacts => ({ id: "x", topic: "T", links: 0, paperItems: 0, dependents: [], ...p });

test("a plan's changes: added, removed, moved in/out, renamed, reordered, importance", () => {
  const before = [{ ...row("a", "Arrays"), importance: "CORE" as const }, row("b", "Loops"), row("c", "Recursion"), row("d", "Files")];
  const after = [
    { id: "c", topic: "Recursion", subtopic: null }, { id: "a", topic: "Arrays & strings", subtopic: null, importance: "CORE" as const },
    { topic: "Pointers", subtopic: null }, { id: "z", topic: "Sorting", subtopic: null, fromCourseId: "OTHER" },
    { id: "b", topic: "Loops", subtopic: null, importance: "OPTIONAL" as const },
  ];
  const items = diffPlan(before, after, new Map([["d", "DSA"]]));
  const kinds = items.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ["ADD", "IMPORTANCE", "MOVE_IN", "MOVE_OUT", "RENAME", "REORDER"].sort());
  assert.equal(items.find((i) => i.kind === "MOVE_OUT")!.lectureRowId, "d");
  assert.deepEqual(items.find((i) => i.kind === "REORDER")!.detail.moved, ["c"]);
  // Applying everything gives the edited plan back; applying only some leaves the rest as it was.
  const all = applyItems(before, items);
  assert.deepEqual(all.map((e) => e.topic), ["Recursion", "Arrays & strings", "Pointers", "Sorting", "Loops"]);
  const some = applyItems(before, items.filter((i) => i.kind === "ADD"));
  assert.deepEqual(some.map((e) => e.topic), ["Arrays", "Loops", "Pointers", "Recursion", "Files"]);
  // A row is never added twice.
  assert.equal(applyItems([row("z", "Sorting")], items.filter((i) => i.kind === "MOVE_IN")).length, 1);
});

test("importance: prefill and suggestions with reasons", () => {
  assert.equal(prefillImportance(facts({ inCouncil: true })), "CORE");
  assert.equal(prefillImportance(facts({ dependents: [{ strength: "MILD", code: "OOP", topic: "Classes" }] })), "CORE");
  assert.equal(prefillImportance(facts({})), "IMPORTANT");
  assert.match(suggestImportance(facts({ dependents: [{ strength: "STRONG", code: "DSA", topic: "Lists" }] })).why, /Strong prerequisite for DSA/);
  assert.equal(suggestImportance(facts({ cloId: "c1", cloLectures: 1 })).level, "CORE");
  assert.equal(suggestImportance(facts({ links: 2, paperItems: 1, cloId: "c1", cloLectures: 3 })).level, "CORE");
  assert.equal(suggestImportance(facts({ sameTopicLectures: 3, cloId: "c1", cloLectures: 3 })).level, "IMPORTANT");
  assert.equal(suggestImportance(facts({ duplication: true, cloId: "c1", cloLectures: 2 })).level, "OPTIONAL");
  assert.equal(suggestImportance(facts({ cloId: "c1", cloLectures: 2 })).level, "OPTIONAL");
});

test("drop-safety: ⛔ / ! / ✓ cases", () => {
  assert.equal(dropSafety(facts({ dependents: [{ strength: "STRONG", code: "DSA", topic: "Lists" }] })).mark, "⛔");
  assert.match(dropSafety(facts({ cloId: "c", cloLectures: 1 })).reason, /only lecture covering its CLO/);
  assert.match(dropSafety(facts({ links: 1, cloId: "c", cloLectures: 2 })).reason, /assessment/);
  assert.equal(dropSafety(facts({ importance: "CORE" })).mark, "⛔");
  assert.equal(dropSafety(facts({ dependents: [{ strength: "WEAK", code: "OOP", topic: "x" }] })).mark, "!");
  assert.equal(dropSafety(facts({ progressionStart: true })).mark, "!");
  assert.equal(dropSafety(facts({ duplication: true })).mark, "✓");
  assert.equal(dropSafety(facts({ importance: "OPTIONAL", cloId: "c", cloLectures: 3 })).mark, "✓");
});

test("short of time: 'Lost 2 lectures' suggests the safe topics first, never ⛔", () => {
  const f = [
    facts({ id: "1", topic: "Core thing", importance: "CORE" }),
    facts({ id: "2", topic: "Strong prereq", importance: "IMPORTANT", dependents: [{ strength: "STRONG", code: "OOP", topic: "x" }] }),
    facts({ id: "3", topic: "History of computing", importance: "OPTIONAL" }),
    facts({ id: "4", topic: "Repeated in OOP", importance: "IMPORTANT", duplication: true }),
    facts({ id: "5", topic: "Mild prereq", importance: "IMPORTANT", dependents: [{ strength: "MILD", code: "OOP", topic: "y" }] }),
  ];
  const r = shortOfTime(f, 2);
  assert.deepEqual(r.picked.map((p) => p.id).sort(), ["3", "4"]);
  assert.equal(r.shortBy, 0);
  assert.ok(!r.choices.some((c) => c.action === "DROP" && (c.id === "1" || c.id === "2")));
  assert.equal(followUpAction("STRONG"), "remediation");
  assert.equal(followUpAction("MILD"), "full review");
  assert.equal(followUpAction("WEAK"), "recap");
  // A topic taught over two lectures can be shortened by one.
  const s = shortOfTime([facts({ id: "a", topic: "Sorting", importance: "CORE" }), facts({ id: "b", topic: "Sorting", importance: "CORE" })], 1);
  assert.equal(s.picked[0].action, "SHORTEN");
});

test("checks: a prerequisite loop is refused and named", () => {
  const edges: [string, string][] = [["PF", "OOP"], ["OOP", "DSA"]];
  const loop = findCycle(edges, ["DSA", "PF"]);
  assert.deepEqual(loop, ["DSA", "PF", "OOP", "DSA"]);
  assert.match(loopText(loop!), /DSA → PF → OOP → DSA/);
  assert.equal(findCycle(edges, ["PF", "DSA"]), null);
  assert.ok(findCycle([["A", "B"], ["B", "A"]]));
});

test("checks: untaught earlier topic, Bloom drop, council coverage, time budget, Core not assessed", () => {
  const plans = new Map<string, CoursePlan>([
    ["PF", { code: "PF", semester: 1, topics: [{ topic: "Functions", bloom: "C3" }, { topic: "Pointers", notTaught: true }] }],
    ["OOP", { code: "OOP", semester: 2, topics: [{ topic: "Methods", bloom: "C2" }, { topic: "References" }] }],
    ["X", { code: "X", semester: 2, topics: [{ topic: "Y" }] }],
  ]);
  const links = [
    { prereqCode: "PF", prereqTopic: "Functions", dependentCode: "OOP", dependentTopic: "Methods", strength: "MILD" },
    { prereqCode: "PF", prereqTopic: "Pointers", dependentCode: "OOP", dependentTopic: "References", strength: "STRONG" },
    { prereqCode: "X", prereqTopic: "Y", dependentCode: "OOP", dependentTopic: "Methods", strength: "WEAK" },
    { prereqCode: "PF", prereqTopic: "Lambdas", dependentCode: "OOP", dependentTopic: "Methods", strength: "WEAK" },
  ];
  const m = missingPrereqs(links, plans).map((x) => x.why);
  assert.ok(m.some((w) => /planned but not taught/.test(w)));
  assert.ok(m.some((w) => /not in an earlier semester/.test(w)));
  assert.ok(m.some((w) => /no longer teaches "Lambdas"/.test(w)));
  assert.equal(bloomDrops(links, plans).length, 1);
  const cc = councilCoverage([{ topic: "Sorting" }], [{ topic: "Sorting" }, { topic: "Sorting" }, { topic: "Hashing" }]);
  assert.deepEqual(cc.missing, ["Hashing"]);
  assert.equal(cc.fewer[0].council, 2);
  const tb = timeBudget(Array(31).fill("CORE"), 30);
  assert.match(tb.warn, /Core topics alone need 31/);
  assert.match(timeBudget(["CORE", "OPTIONAL", null], 30).line, /Core 1 of 30 lectures · Important 0 · Optional 1 · not set 1/);
  assert.deepEqual(coreNotAssessed([facts({ topic: "A", importance: "CORE" }), facts({ topic: "B", importance: "CORE", links: 1 })]).map((x) => x.topic), ["A"]);
});

test("checks: mid-term topic after the mid, past the last week, holidays; lab ahead of theory", () => {
  const c = calendarCheck([{ topic: "Trees", week: 9, midterm: true }, { topic: "Graphs", week: 17 }, { topic: "Heaps", week: 5 }], { midWeek: 8, lastWeek: 16, holidayWeeks: [5] });
  assert.ok(c.some((x) => /midterm paper but planned for week 9/.test(x)));
  assert.ok(c.some((x) => /after the last teaching week/.test(x)));
  assert.ok(c.some((x) => /Week 5 has a holiday/.test(x)));
  const l = labVsTheory([{ topic: "Linked list implementation", week: 3 }], [{ topic: "Linked lists", week: 6 }]);
  assert.equal(l.length, 1);
  assert.equal(labVsTheory([{ topic: "Linked list implementation", week: 7 }], [{ topic: "Linked lists", week: 6 }]).length, 0);
});

test("GA reach, question bank coverage", () => {
  const g = gaReach([{ id: "a", cloId: "c1" }, { id: "b", cloId: "c2" }, { id: "c", cloId: "c2" }], new Map([["c1", [3]], ["c2", [1]]]));
  assert.deepEqual(g.onlyPath("a"), [3]);
  assert.deepEqual(g.onlyPath("b"), []);
  const bank = bankCoverage([{ topic: "Recursion", importance: "CORE" }, { topic: "History", importance: "OPTIONAL" }], [{ text: "Write a recursion for factorial", kind: "SHORT", bloom: "C3" }], 5);
  assert.equal(bank[0].count, 1);
  assert.equal(bank[0].flag, true);
  assert.equal(bank[1].flag, false);
});

test("two people saving: the second save keeps both sets of changes", () => {
  const base = [row("a", "A"), row("b", "B"), row("c", "C")];
  const theirs = [row("a", "A"), { id: "b", topic: "B renamed", subtopic: null }, row("c", "C"), { topic: "Theirs new", subtopic: null }];
  const mine = [row("c", "C"), row("a", "A"), { topic: "Mine new", subtopic: null }];
  const { merged } = mergeLayouts(base, mine, theirs);
  const t = merged.map((e) => e.topic);
  assert.ok(!t.includes("B") && !t.includes("B renamed"), "my removal of B is kept");
  assert.ok(t.includes("Theirs new") && t.includes("Mine new"), "both additions are kept");
  assert.ok(t.indexOf("C") < t.indexOf("A"), "my reorder is kept");
  assert.equal(t.indexOf("Mine new"), t.indexOf("A") + 1, "my new topic sits after the same neighbour");
  const both = mergeLayouts(base, [{ id: "a", topic: "Mine A", subtopic: null }, row("b", "B"), row("c", "C")], [{ id: "a", topic: "Their A", subtopic: null }, row("b", "B"), row("c", "C")]);
  assert.equal(both.merged[0].topic, "Their A");
  assert.equal(both.conflicts.length, 1);
});

test("the chain PF → OOP → DSA opens OOP and DSA in semester order; suggested-only listed apart", () => {
  const courses = [{ id: "DSA", code: "CS201", title: "DSA", semester: 3 }, { id: "PF", code: "CS101", title: "PF", semester: 1 }, { id: "OOP", code: "CS102", title: "OOP", semester: 2 }, { id: "AI", code: "CS301", title: "AI", semester: 5 }];
  const r = chainOf("PF", courses, [["PF", "OOP"], ["OOP", "DSA"]], [["DSA", "AI"]], "down");
  assert.deepEqual(r.confirmed.map((c) => c.id), ["OOP", "DSA"]);
  assert.deepEqual(r.suggestedOnly.map((c) => c.id), ["AI"]);
  assert.equal(r.preview, "2 courses: OOP (S2), DSA (S3)");
  assert.deepEqual(chainOf("DSA", courses, [["PF", "OOP"], ["OOP", "DSA"]], [], "up").confirmed.map((c) => c.id), ["PF", "OOP"]);
});

test("topic performance: overall / last 3 / last with counts; under 30 students is too little data", () => {
  const h = [
    { courseCode: "CS1", termLabel: "F22", offeredAt: "2022-12-01", students: 20, avgPct: 40, belowPct: 60, questions: 2, assessments: 1, lectures: 2, sections: 1 },
    { courseCode: "CS1", termLabel: "F23", offeredAt: "2023-12-01", students: 25, avgPct: 50, belowPct: 40, questions: 3, assessments: 2, lectures: 3, sections: 1 },
    { courseCode: "CS1", termLabel: "F24", offeredAt: "2024-12-01", students: 25, avgPct: 70, belowPct: 10, questions: 3, assessments: 2, lectures: 3, sections: 1 },
  ];
  const all = perfSummary(h, "overall");
  assert.equal(all.shown!.students, 70);
  assert.equal(all.tooLittle, false);
  assert.equal(all.trend, 20);
  assert.equal(perfSummary(h, "last").tooLittle, true);
  assert.equal(perfSummary(h, "last").heat, "grey");
  assert.equal(perfSummary(h, "last3").questions, 8);
  // Lectures spent vs results: only with 2+ offerings that spent a different number of lectures.
  assert.equal(lecturesVsResults(h)!.length, 2);
  assert.equal(lecturesVsResults(h.slice(1)), null);
  // Sections compared: sections under 15 students are hidden.
  assert.deepEqual(sectionCompare([{ section: "A", students: 40, avgPct: 60 }, { section: "B", students: 10, avgPct: 20 }, { section: "C", students: 30, avgPct: 50 }]).map((s) => s.section), ["C", "A"]);
});

test("suggestions without AI: only from earlier-semester courses; council pair gets more confidence", () => {
  const pf = { code: "CS101", semester: 1, topics: ["Functions and parameters", "Loops"] };
  const oop = { code: "CS102", semester: 2, topics: ["Methods and parameters", "Loops in classes"] };
  const s = textLinkSuggestions(pf, oop);
  assert.ok(s.length >= 1 && s.every((x) => x.fromCode === "CS101" && x.toCode === "CS102"));
  assert.equal(textLinkSuggestions(oop, pf).length, 0, "never from a later semester");
  assert.equal(textLinkSuggestions({ ...pf, semester: 2 }, oop).length, 0, "nor the same semester");
  const council = new Set(["functions and parameters", "methods and parameters"]);
  assert.equal(textLinkSuggestions(pf, oop, council).find((x) => x.toTopic === "Methods and parameters")!.confidence, "Medium");
  assert.equal(orderSuggestions(["Sorting linked lists", "Linked lists"]).length, 1);
});

test("link approvals: Mild needs both SEs + PL; Strong also 2 OMC", () => {
  const now = new Date();
  const mild = linkSteps({ kind: "PREREQ", level: "MILD", seFromAt: now, seToAt: now, plAt: null }, 0);
  assert.equal(mild.complete, false);
  assert.deepEqual(mild.waiting, ["Program Lead"]);
  assert.equal(linkSteps({ kind: "PREREQ", level: "MILD", seFromAt: now, seToAt: now, plAt: now }, 0).complete, true);
  const strong = linkSteps({ kind: "PREREQ", level: "STRONG", seFromAt: now, seToAt: now, plAt: now }, 1);
  assert.equal(strong.complete, false);
  assert.equal(linkSteps({ kind: "PREREQ", level: "STRONG", seFromAt: now, seToAt: now, plAt: now }, 2).complete, true);
  assert.equal(linkSteps({ kind: "OVERLAP", level: "DUPLICATION", seFromAt: now, seToAt: now, plAt: now }, 0).complete, true);
});
