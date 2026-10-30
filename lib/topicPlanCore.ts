import { norm, similarity } from "./textMatch";

// The rules of the Topic Workspace, kept free of the database so they can be tested on their own: what changed in a
// plan (and how to apply some or all of it), importance, whether a topic is safe to drop, "short of time" choices,
// the checks (loops, missing prerequisites, Bloom drops, council coverage, time budget, calendar, lab vs theory,
// GA reach, question bank), merging two people's saves, the chain of courses, topic performance summaries and the
// text-only topic-link suggestions used when no AI key is set.

export type Level = "CORE" | "IMPORTANT" | "OPTIONAL";
export const LEVELS: Level[] = ["CORE", "IMPORTANT", "OPTIONAL"];
export const LEVEL_LABEL: Record<Level, string> = { CORE: "Core", IMPORTANT: "Important", OPTIONAL: "Optional" };
export const topicKey = (t: string) => norm(t).slice(0, 200);
/** Wording match that ignores plural endings ("linked list" ~ "linked lists"). */
export const loose = (a: string, b: string) => { const st = (t: string) => norm(t).split(" ").map((w) => (w.length > 3 ? w.replace(/(ies)$/, "y").replace(/([^s])s$/, "$1") : w)).join(" "); return similarity(st(a), st(b)); };
export const BLOOM_RANK = (b: string | null | undefined) => { const m = /C?([1-6])/i.exec(b || ""); return m ? Number(m[1]) : 0; };

/** A short stable hash of some text (to remember a rejected suggestion until its wording changes). */
export function textHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ------------------------------------------------------------------------------------------------ plan differences
export type Row = { id: string; topic: string; subtopic: string | null; importance?: Level | null };
/** One entry of an edited plan: an existing lecture row (maybe from another course), or a new topic. */
/** mergedFrom: this entry is the merge of these rows (its own id first); splitFrom: this entry is a part of that row, split. */
export type Entry = { id?: string; topic: string; subtopic: string | null; importance?: Level | null; fromCourseId?: string | null; lectureRowFrom?: string | null; mergedFrom?: string[] | null; splitFrom?: string | null };
export type ItemKind = "ADD" | "REMOVE" | "MOVE_IN" | "MOVE_OUT" | "RENAME" | "REORDER" | "IMPORTANCE" | "MERGE" | "SPLIT" | "LINK" | "DROP" | "SHORTEN";
export type Item = { kind: ItemKind; lectureRowId: string | null; topic: string; subtopic: string | null; position: number; detail: Record<string, unknown>; linkKey?: string | null };

/**
 * What changed between the plan as it is (`before`) and as edited (`after`). Rows of `before` that are no longer
 * there are REMOVE, or MOVE_OUT when `movedTo` says another open course took them; rows from elsewhere are MOVE_IN.
 */
export function diffPlan(before: Row[], after: Entry[], movedTo: Map<string, string> = new Map()): Item[] {
  const items: Item[] = [];
  const old = new Map(before.map((r) => [r.id, r]));
  const kept = after.filter((e) => e.id && old.has(e.id)).map((e) => e.id!);
  after.forEach((e, i) => {
    if (!e.id) { items.push({ kind: "ADD", lectureRowId: null, topic: e.topic.trim(), subtopic: e.subtopic || null, position: i, detail: e.importance ? { importance: e.importance } : {} }); return; }
    const o = old.get(e.id);
    if (!o) { items.push({ kind: "MOVE_IN", lectureRowId: e.id, topic: e.topic.trim(), subtopic: e.subtopic || null, position: i, detail: { fromCourseId: e.fromCourseId || null, ...(e.importance ? { importance: e.importance } : {}) } }); return; }
    if (o.topic.trim() !== e.topic.trim() || (o.subtopic || "") !== (e.subtopic || "")) items.push({ kind: "RENAME", lectureRowId: e.id, topic: e.topic.trim(), subtopic: e.subtopic || null, position: i, detail: { oldTopic: o.topic, oldSubtopic: o.subtopic } });
    if ((e.importance || null) !== (o.importance || null) && e.importance) items.push({ kind: "IMPORTANCE", lectureRowId: e.id, topic: e.topic, subtopic: null, position: i, detail: { from: o.importance || null, to: e.importance } });
  });
  for (const r of before) {
    if (kept.includes(r.id)) continue;
    const to = movedTo.get(r.id);
    items.push({ kind: to ? "MOVE_OUT" : "REMOVE", lectureRowId: r.id, topic: r.topic, subtopic: r.subtopic, position: before.indexOf(r), detail: to ? { toCourseId: to } : {} });
  }
  const was = before.map((r) => r.id).filter((id) => kept.includes(id));
  if (was.join(",") !== kept.join(",")) items.push({ kind: "REORDER", lectureRowId: null, topic: "", subtopic: null, position: 0, detail: { order: kept, moved: movedRows(was, kept) } });
  return items;
}

/**
 * What changed, by what the person did (recorded on the cards as they edited), not guessed from the result: a merge is
 * one MERGE ("Merged L7 + L8 → L7"), a split one SPLIT; everything else as diffPlan finds it (ADD, REMOVE, MOVE,
 * RENAME, REORDER, IMPORTANCE). Lecture numbers are the plan's L1, L2 … before the change.
 */
export function intentItems(before: Row[], after: Entry[], movedTo: Map<string, string> = new Map()): Item[] {
  const L = new Map(before.map((r, i) => [r.id, i + 1]));
  const byId = new Map(before.map((r) => [r.id, r]));
  const consumedRows = new Set<string>(); // rows that disappear into a merge
  const renamedBy = new Set<string>(); // rows whose new wording comes from a merge or split
  const partEntries = new Set<Entry>(); // new entries that are parts of a split
  const items: Item[] = [];
  after.forEach((e, i) => {
    const from = (e.mergedFrom || []).filter((id) => byId.has(id));
    if (e.id && from.length > 1) {
      for (const id of from) if (id !== e.id) consumedRows.add(id);
      renamedBy.add(e.id);
      items.push({ kind: "MERGE", lectureRowId: e.id, topic: e.topic, subtopic: e.subtopic, position: i, detail: { into: L.get(e.id), lectures: from.map((id) => L.get(id)), parts: from.map((id) => ({ id, topic: byId.get(id)!.topic })), oldTopic: byId.get(e.id)?.topic } });
    }
  });
  const splits = new Map<string, Entry[]>();
  for (const e of after) if (e.splitFrom && byId.has(e.splitFrom)) splits.set(e.splitFrom, (splits.get(e.splitFrom) || []).concat(e));
  for (const [src, parts] of Array.from(splits.entries())) {
    const own = after.find((e) => e.id === src);
    const all = (own ? [own] : []).concat(parts.filter((p) => p !== own));
    for (const p of all) if (!p.id) partEntries.add(p);
    if (own) renamedBy.add(src);
    items.push({ kind: "SPLIT", lectureRowId: src, topic: byId.get(src)!.topic, subtopic: null, position: after.indexOf(all[0]), detail: { lecture: L.get(src), parts: all.map((p) => ({ topic: p.topic, subtopic: p.subtopic, position: after.indexOf(p), id: p.id || null })) } });
  }
  const rest = diffPlan(before, after.filter((e) => !partEntries.has(e)), movedTo).filter((it) =>
    !(it.kind === "REMOVE" && it.lectureRowId && consumedRows.has(it.lectureRowId)) && !(it.kind === "RENAME" && it.lectureRowId && renamedBy.has(it.lectureRowId)));
  return items.concat(rest.map((it) => (it.lectureRowId && L.has(it.lectureRowId) ? { ...it, detail: { ...it.detail, lecture: L.get(it.lectureRowId) } } : it)));
}

/** The rows whose place changed (the fewest: everything outside the longest run kept in order). */
function movedRows(was: string[], now: string[]) {
  const idx = new Map(was.map((id, i) => [id, i]));
  const seq = now.map((id) => idx.get(id)!);
  const tails: number[] = [], prev: number[] = new Array(seq.length).fill(-1), at: number[] = [];
  seq.forEach((v, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (seq[tails[m]] < v) lo = m + 1; else hi = m; }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i; at[lo] = i;
  });
  const keep = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i);
  return now.filter((_, i) => !keep.has(i));
}

/** Applies accepted items to a plan: the new order of entries (existing rows by id, new topics without). */
export function applyItems(current: Row[], items: Item[]): Entry[] {
  let list: Entry[] = current.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic, importance: r.importance || null }));
  const reorder = items.find((i) => i.kind === "REORDER");
  if (reorder) {
    const order = (reorder.detail.order as string[]) || [];
    const pos = new Map(order.map((id, i) => [id, i]));
    // Rows the proposal didn't know about keep their place relative to the row before them.
    const placed = list.filter((e) => pos.has(e.id!)).sort((a, b) => pos.get(a.id!)! - pos.get(b.id!)!);
    const out: Entry[] = []; let k = 0;
    for (const e of list) out.push(pos.has(e.id!) ? placed[k++] : e);
    list = out;
  }
  for (const it of items) {
    if (it.kind === "REMOVE" || it.kind === "MOVE_OUT" || it.kind === "DROP") list = list.filter((e) => e.id !== it.lectureRowId);
    if (it.kind === "RENAME") list = list.map((e) => (e.id === it.lectureRowId ? { ...e, topic: it.topic, subtopic: it.subtopic } : e));
    if (it.kind === "IMPORTANCE") list = list.map((e) => (e.id === it.lectureRowId ? { ...e, importance: it.detail.to as Level } : e));
    if (it.kind === "MERGE") {
      const gone = new Set(((it.detail.parts as { id: string }[]) || []).map((p) => p.id).filter((id) => id !== it.lectureRowId));
      list = list.filter((e) => !(e.id && gone.has(e.id))).map((e) => (e.id === it.lectureRowId ? { ...e, topic: it.topic, subtopic: it.subtopic } : e));
    }
    if (it.kind === "SPLIT") {
      const parts = (it.detail.parts as { topic: string; subtopic: string | null; id: string | null }[]) || [];
      const at = list.findIndex((e) => e.id === it.lectureRowId);
      if (at >= 0 && parts.length) {
        const first = parts.find((p) => p.id === it.lectureRowId) || parts[0];
        list[at] = { ...list[at], topic: first.topic, subtopic: first.subtopic };
        list.splice(at + 1, 0, ...parts.filter((p) => p !== first).map((p) => ({ topic: p.topic, subtopic: p.subtopic, importance: list[at].importance || null })));
      }
    }
  }
  for (const it of items.filter((i) => i.kind === "ADD" || i.kind === "MOVE_IN").sort((a, b) => a.position - b.position)) {
    const e: Entry = it.kind === "ADD" ? { topic: it.topic, subtopic: it.subtopic, importance: (it.detail.importance as Level) || null } : { id: it.lectureRowId!, topic: it.topic, subtopic: it.subtopic, importance: (it.detail.importance as Level) || null, fromCourseId: (it.detail.fromCourseId as string) || null };
    if (e.id && list.some((x) => x.id === e.id)) continue; // never twice
    list.splice(Math.max(0, Math.min(it.position, list.length)), 0, e);
  }
  return list;
}

export const itemLine = (it: Pick<Item, "kind" | "topic" | "detail">, courseCode?: (id: string) => string) => {
  const d = it.detail || {};
  switch (it.kind) {
    case "ADD": return `Add "${it.topic}"`;
    case "REMOVE": return `Remove "${it.topic}"`;
    case "MOVE_IN": return `Move in "${it.topic}"${d.fromCourseId && courseCode ? ` from ${courseCode(String(d.fromCourseId))}` : ""}`;
    case "MOVE_OUT": return `Move "${it.topic}" out${d.toCourseId && courseCode ? ` to ${courseCode(String(d.toCourseId))}` : ""}`;
    case "RENAME": return `Rename "${d.oldTopic}" to "${it.topic}"`;
    case "REORDER": return `Reorder ${((d.moved as string[]) || []).length || "some"} topic(s)`;
    case "IMPORTANCE": return `"${it.topic}": ${d.from ? LEVEL_LABEL[d.from as Level] : "not set"} → ${LEVEL_LABEL[d.to as Level]}`;
    case "DROP": return `Drop "${it.topic}" (planned but not taught)`;
    case "SHORTEN": return `Shorten "${it.topic}" by one lecture`;
    case "MERGE": return `Merged ${((d.lectures as number[]) || []).map((n) => `L${n}`).join(" + ")} → L${d.into}: "${it.topic}"`;
    case "SPLIT": return `Split L${d.lecture} "${it.topic}" into ${((d.parts as unknown[]) || []).length}: ${((d.parts as { topic: string }[]) || []).map((p) => `"${p.topic}"`).join(" + ")}`;
    case "LINK": return `${d.action === "REMOVE" ? "Remove link" : d.action === "CHANGE" ? "Change link" : "Link"}: ${d.fromCode} "${d.fromTopic}" → ${d.toCode} "${d.toTopic}" (${String(d.level || "").toLowerCase()})`;
  }
};

// ------------------------------------------------------------------------------------------------ importance & safety
export type TopicFacts = {
  id: string; topic: string; importance?: Level | null; cloId?: string | null;
  links: number; paperItems: number;                 // quizzes/assignments and exam questions linked to the lecture
  dependents: { strength: string; code: string; topic: string }[]; // later topics that need this one
  progressionStart?: boolean; duplication?: boolean; // overlap reviews with a later course
  inCouncil?: boolean; sameTopicLectures?: number;   // lectures of the plan with this same topic
  cloLectures?: number;                              // lectures of the plan that cover this row's CLO
  avgPct?: number | null;
};

/** Prefill when nobody has set one yet: Core if the council outline has it or another course strongly/mildly needs it. */
export function prefillImportance(f: TopicFacts): Level {
  return f.inCouncil || f.dependents.some((d) => d.strength === "STRONG" || d.strength === "MILD") ? "CORE" : "IMPORTANT";
}

/** The suggestion, with why. */
export function suggestImportance(f: TopicFacts): { level: Level; why: string; confidence: "High" | "Medium" | "Low" } {
  if (f.inCouncil) return { level: "CORE", why: "In the council (curriculum) outline", confidence: "High" };
  const need = f.dependents.find((d) => d.strength === "STRONG") || f.dependents.find((d) => d.strength === "MILD");
  if (need) return { level: "CORE", why: `${need.strength === "STRONG" ? "Strong" : "Mild"} prerequisite for ${need.code}: ${need.topic}`, confidence: need.strength === "STRONG" ? "High" : "Medium" };
  if (f.cloId && (f.cloLectures ?? 2) <= 1) return { level: "CORE", why: "The only lecture covering its CLO", confidence: "High" };
  if (f.links + f.paperItems >= 3) return { level: "CORE", why: `Heavily assessed (${f.links + f.paperItems} assessment items)`, confidence: "Medium" };
  if ((f.sameTopicLectures || 1) >= 2) return { level: "IMPORTANT", why: `Taught over ${f.sameTopicLectures} lectures`, confidence: "Medium" };
  if (f.duplication) return { level: "OPTIONAL", why: "Duplicates a topic taught in another course", confidence: "Medium" };
  if (!f.dependents.length && f.links + f.paperItems === 0 && (!f.cloId || (f.cloLectures ?? 0) > 1)) return { level: "OPTIONAL", why: "Nothing depends on it, not assessed, its CLO is covered elsewhere", confidence: "Low" };
  return { level: "IMPORTANT", why: "Part of the course with no special reason to be Core or Optional", confidence: "Low" };
}

export type Safety = { mark: "⛔" | "!" | "✓"; reason: string };
/** Can this topic be dropped? The first matching rule wins. */
export function dropSafety(f: TopicFacts): Safety {
  const strong = f.dependents.find((d) => d.strength === "STRONG");
  if (strong) return { mark: "⛔", reason: `Strong prerequisite for ${strong.code}: ${strong.topic}` };
  if (f.cloId && (f.cloLectures ?? 2) <= 1) return { mark: "⛔", reason: "The only lecture covering its CLO" };
  if (f.links + f.paperItems > 0) return { mark: "⛔", reason: `Used in ${f.links + f.paperItems} assessment item(s) (quiz, assignment, mid or final question)` };
  if (f.importance === "CORE") return { mark: "⛔", reason: "Marked Core" };
  const soft = f.dependents.find((d) => d.strength === "MILD") || f.dependents.find((d) => d.strength === "WEAK");
  if (soft) return { mark: "!", reason: `${soft.strength === "MILD" ? "Mild" : "Weak"} prerequisite for ${soft.code}: ${soft.topic}` };
  if (f.progressionStart) return { mark: "!", reason: "A later course builds on it (Progression)" };
  if (f.duplication) return { mark: "✓", reason: "Taught again in another course (Duplication)" };
  if (f.importance === "OPTIONAL") return { mark: "✓", reason: "Optional, nothing depends on it, its CLO is covered elsewhere" };
  return { mark: "!", reason: f.importance === "IMPORTANT" ? "Important topic — drop with care" : "Check before dropping" };
}

// ------------------------------------------------------------------------------------------------ short of time
export type Choice = { action: "DROP" | "SHORTEN"; id: string; topic: string; saves: number; cost: number; why: string; safety: Safety };
/** "I lost N lectures": the cheapest ways to win back N lectures, safest first. ⛔ topics are never offered. */
export function shortOfTime(facts: TopicFacts[], lost: number): { choices: Choice[]; picked: Choice[]; shortBy: number } {
  const choices: Choice[] = [];
  const seenTopic = new Map<string, number>();
  for (const f of facts) seenTopic.set(topicKey(f.topic), (seenTopic.get(topicKey(f.topic)) || 0) + 1);
  const shortened = new Set<string>();
  for (const f of facts) {
    const s = dropSafety(f);
    const lvl = f.importance || "IMPORTANT";
    const hard = f.avgPct != null && f.avgPct < 50 ? 2 : 0;
    const base = (lvl === "OPTIONAL" ? 1 : lvl === "IMPORTANT" ? 3 : 9) + (s.mark === "!" ? 2 : 0) + hard;
    const k = topicKey(f.topic);
    if ((seenTopic.get(k) || 0) >= 2 && !shortened.has(k) && !(f.links + f.paperItems > 0)) {
      shortened.add(k);
      choices.push({ action: "SHORTEN", id: f.id, topic: f.topic, saves: 1, cost: Math.max(1, base - 1), why: `${seenTopic.get(k)} lectures → ${seenTopic.get(k)! - 1}${hard ? "; students find it hard" : ""}`, safety: s.mark === "⛔" ? { mark: "!", reason: "Keeps the topic, one lecture less" } : s });
    }
    if (s.mark === "⛔") continue;
    choices.push({ action: "DROP", id: f.id, topic: f.topic, saves: 1, cost: base + (s.mark === "✓" ? 0 : 1), why: `${s.reason}${hard ? "; students find it hard" : ""}`, safety: s });
  }
  choices.sort((a, b) => a.cost - b.cost || (a.safety.mark === "✓" ? -1 : 0) - (b.safety.mark === "✓" ? -1 : 0));
  const picked: Choice[] = []; const used = new Set<string>(); let got = 0;
  for (const c of choices) { if (got >= lost) break; if (used.has(c.id)) continue; used.add(c.id); picked.push(c); got += c.saves; }
  return { choices, picked, shortBy: Math.max(0, lost - got) };
}
export const followUpAction = (strength: string) => (strength === "STRONG" ? "remediation" : strength === "MILD" ? "full review" : "recap");

// ------------------------------------------------------------------------------------------------ checks
/** A loop in course-level prerequisites, if adding `edge` would close one: ["PF", "OOP", "DSA", "PF"]. */
export function findCycle(edges: [string, string][], edge?: [string, string]): string[] | null {
  const all = edge ? edges.concat([edge]) : edges;
  const next = new Map<string, string[]>();
  for (const [a, b] of all) { if (a === b) return [a, a]; next.set(a, (next.get(a) || []).concat(b)); }
  const starts = edge ? [edge[1]] : Array.from(next.keys());
  for (const s of starts) {
    const target = edge ? edge[0] : s;
    const stack: [string, string[]][] = [[s, [s]]]; const seen = new Set<string>();
    while (stack.length) {
      const [n, path] = stack.pop()!;
      for (const m of next.get(n) || []) {
        if (m === target) return edge ? [edge[0], ...path, edge[0]] : [...path, m];
        if (!seen.has(m)) { seen.add(m); stack.push([m, [...path, m]]); }
      }
    }
  }
  return null;
}
export const loopText = (loop: string[]) => `This would make a loop: ${loop.join(" → ")}. A course can't (indirectly) be its own prerequisite.`;

export type LinkLite = { prereqCode: string; prereqTopic: string; dependentCode: string; dependentTopic: string; strength: string };
export type CoursePlan = { code: string; semester: number | null; topics: { topic: string; bloom?: string | null; notTaught?: boolean }[] };
/** Topics a course needs that the earlier course doesn't teach (or teaches in the same or a later semester). */
export function missingPrereqs(links: LinkLite[], plans: Map<string, CoursePlan>): { link: LinkLite; why: string }[] {
  const out: { link: LinkLite; why: string }[] = [];
  for (const l of links) {
    const p = plans.get(l.prereqCode), d = plans.get(l.dependentCode);
    if (!d) continue;
    if (!p) { out.push({ link: l, why: `${l.prereqCode} is not in the program's plan` }); continue; }
    const t = p.topics.find((x) => norm(x.topic) === norm(l.prereqTopic)) || p.topics.find((x) => similarity(x.topic, l.prereqTopic) >= 0.6);
    if (!t) out.push({ link: l, why: `${l.prereqCode} no longer teaches "${l.prereqTopic}"` });
    else if (t.notTaught) out.push({ link: l, why: `"${l.prereqTopic}" was planned but not taught in ${l.prereqCode}` });
    else if (p.semester != null && d.semester != null && p.semester >= d.semester) out.push({ link: l, why: `${l.prereqCode} (S${p.semester}) is not in an earlier semester than ${l.dependentCode} (S${d.semester})` });
  }
  return out;
}
/** A later topic taught at a lower Bloom level than the topic it builds on. */
export function bloomDrops(links: LinkLite[], plans: Map<string, CoursePlan>) {
  const out: { link: LinkLite; from: number; to: number }[] = [];
  for (const l of links) {
    const a = plans.get(l.prereqCode)?.topics.find((x) => norm(x.topic) === norm(l.prereqTopic));
    const b = plans.get(l.dependentCode)?.topics.find((x) => norm(x.topic) === norm(l.dependentTopic));
    const ra = BLOOM_RANK(a?.bloom), rb = BLOOM_RANK(b?.bloom);
    if (ra && rb && rb < ra) out.push({ link: l, from: ra, to: rb });
  }
  return out;
}
/** Council (curriculum) outline topics missing from the plan, or given fewer lectures. */
export function councilCoverage(plan: { topic: string }[], council: { topic: string }[]) {
  const count = (list: { topic: string }[], t: string) => list.filter((x) => norm(x.topic) === norm(t) || similarity(x.topic, t) >= 0.5).length;
  const keys = Array.from(new Map(council.map((c) => [norm(c.topic), c.topic])).values());
  const missing: string[] = [], fewer: { topic: string; council: number; plan: number }[] = [];
  for (const t of keys) {
    const want = council.filter((c) => norm(c.topic) === norm(t)).length, have = count(plan, t);
    if (!have) missing.push(t); else if (have < want) fewer.push({ topic: t, council: want, plan: have });
  }
  return { missing, fewer };
}
/** "Core 24 of 30 lectures · Important 4 · Optional 2"; warns when Core alone needs more lectures than there are. */
export function timeBudget(levels: (Level | null | undefined)[], available: number) {
  const n = { CORE: 0, IMPORTANT: 0, OPTIONAL: 0, unset: 0 };
  for (const l of levels) { if (l) n[l]++; else n.unset++; }
  const line = `Core ${n.CORE} of ${available} lectures · Important ${n.IMPORTANT} · Optional ${n.OPTIONAL}${n.unset ? ` · not set ${n.unset}` : ""}`;
  const warn = n.CORE > available ? `Core topics alone need ${n.CORE} lectures but only ${available} are available.` : levels.length > available ? `The plan has ${levels.length} lectures for ${available} available; ${levels.length - available} would have to be Optional or dropped.` : "";
  return { ...n, available, line, warn };
}
export const coreNotAssessed = (f: TopicFacts[]) => f.filter((x) => x.importance === "CORE" && x.links + x.paperItems === 0);

/** Calendar: a topic examined in the midterm but planned after the mid-term week; lectures past the last teaching week; lectures on holidays. */
export function calendarCheck(rows: { topic: string; week: number; midterm?: boolean }[], o: { midWeek: number | null; lastWeek: number | null; holidayWeeks?: number[] }) {
  const out: string[] = [];
  if (o.midWeek) for (const r of rows) if (r.midterm && r.week > o.midWeek) out.push(`"${r.topic}" is in the midterm paper but planned for week ${r.week}, after the mid-term (week ${o.midWeek}).`);
  if (o.lastWeek) { const past = rows.filter((r) => r.week > o.lastWeek!); if (past.length) out.push(`${past.length} lecture(s) are planned after the last teaching week (week ${o.lastWeek}): ${past.slice(0, 3).map((r) => r.topic).join(", ")}${past.length > 3 ? "…" : ""}.`); }
  for (const w of o.holidayWeeks || []) { const hit = rows.filter((r) => r.week === w); if (hit.length) out.push(`Week ${w} has a holiday; ${hit.map((r) => `"${r.topic}"`).join(", ")} may need to move.`); }
  return out;
}
/** A lab exercise planned before the theory lecture it needs. */
export function labVsTheory(lab: { topic: string; week: number }[], theory: { topic: string; week: number }[]) {
  const out: { lab: string; labWeek: number; theory: string; theoryWeek: number }[] = [];
  for (const l of lab) {
    let best: { topic: string; week: number } | null = null, s = 0;
    for (const t of theory) { const v = loose(l.topic, t.topic) + (norm(l.topic).includes(norm(t.topic)) ? 1 : 0); if (v > s) { s = v; best = t; } }
    if (best && s >= 0.4 && best.week > l.week) out.push({ lab: l.topic, labWeek: l.week, theory: best.topic, theoryWeek: best.week });
  }
  return out;
}
/** Per GA (PLO): how many lectures reach it (topic → CLO → GA); and which GAs a topic is the only path to. */
export function gaReach(rows: { id: string; cloId: string | null; importance?: Level | null }[], cloPlos: Map<string, number[]>) {
  const per = new Map<number, string[]>();
  for (const r of rows) for (const p of (r.cloId && cloPlos.get(r.cloId)) || []) per.set(p, (per.get(p) || []).concat(r.id));
  const onlyPath = (id: string) => Array.from(per.entries()).filter(([, ids]) => ids.length === 1 && ids[0] === id).map(([p]) => p);
  return { per, onlyPath };
}
/** Question bank items per topic (by matching text), with flags for Core or hard topics with too few. */
export function bankCoverage(topics: { topic: string; importance?: Level | null; hard?: boolean }[], bank: { text: string; kind: string; bloom: string }[], min = 5) {
  return topics.map((t) => {
    const hits = bank.filter((b) => norm(b.text).includes(norm(t.topic)) || similarity(b.text, t.topic) >= 0.25);
    const byKind: Record<string, number> = {}, byBloom: Record<string, number> = {};
    for (const h of hits) { byKind[h.kind] = (byKind[h.kind] || 0) + 1; byBloom[h.bloom] = (byBloom[h.bloom] || 0) + 1; }
    return { topic: t.topic, count: hits.length, byKind, byBloom, flag: (t.importance === "CORE" || !!t.hard) && hits.length < min };
  });
}

// ------------------------------------------------------------------------------------------------ two people saving
/**
 * Someone else saved the same plan after this person opened it. Keep both sets of changes: start from theirs, take out
 * what this person removed, put back what this person added or moved (after the same neighbour), apply this person's
 * renames where they didn't rename the same row, and this person's order for the rows both kept.
 */
export function mergeLayouts(base: Entry[], mine: Entry[], theirs: Entry[]): { merged: Entry[]; conflicts: string[] } {
  const conflicts: string[] = [];
  const baseIds = new Set(base.filter((e) => e.id).map((e) => e.id!));
  const mineIds = new Set(mine.filter((e) => e.id).map((e) => e.id!));
  const removedByMe = new Set(Array.from(baseIds).filter((id) => !mineIds.has(id)));
  let merged = theirs.filter((e) => !(e.id && removedByMe.has(e.id)));
  const baseOf = new Map(base.filter((e) => e.id).map((e) => [e.id!, e]));
  merged = merged.map((e) => {
    if (!e.id) return e;
    const b = baseOf.get(e.id), m = mine.find((x) => x.id === e.id);
    if (!b || !m) return e;
    const iRenamed = m.topic !== b.topic || (m.subtopic || "") !== (b.subtopic || "");
    const theyRenamed = e.topic !== b.topic || (e.subtopic || "") !== (b.subtopic || "");
    if (iRenamed && theyRenamed && m.topic !== e.topic) conflicts.push(`Both renamed "${b.topic}": kept theirs ("${e.topic}"), yours was "${m.topic}".`);
    return { ...e, ...(iRenamed && !theyRenamed ? { topic: m.topic, subtopic: m.subtopic } : {}), importance: m.importance !== b.importance ? m.importance : e.importance };
  });
  // My order for the rows that both of us kept (only if I reordered them).
  const both = mine.filter((e) => e.id && baseIds.has(e.id) && merged.some((x) => x.id === e.id)).map((e) => e.id!);
  const baseOrder = base.filter((e) => e.id && both.includes(e.id)).map((e) => e.id!);
  if (both.join(",") !== baseOrder.join(",")) {
    const slots = merged.map((e, i) => (e.id && both.includes(e.id) ? i : -1)).filter((i) => i >= 0);
    const byId = new Map(merged.filter((e) => e.id).map((e) => [e.id!, e]));
    slots.forEach((slot, k) => { merged[slot] = byId.get(both[k])!; });
  }
  // What I added (new topics, or rows moved in from other courses): after the same neighbour as in my plan.
  mine.forEach((e, i) => {
    if (e.id && (baseIds.has(e.id) || merged.some((x) => x.id === e.id))) return;
    if (!e.id && merged.some((x) => !x.id && x.topic === e.topic)) return;
    const prev = i > 0 ? mine[i - 1] : null;
    const at = prev ? merged.findIndex((x) => (prev.id ? x.id === prev.id : !x.id && x.topic === prev.topic)) + 1 : 0;
    merged.splice(at > 0 ? at : prev ? merged.length : 0, 0, e);
  });
  return { merged, conflicts };
}
export const layoutHash = (rows: { id: string; topic: string; subtopic: string | null }[]) => textHash(rows.map((r) => `${r.id}|${r.topic}|${r.subtopic || ""}`).join("\n"));

// ------------------------------------------------------------------------------------------------ the chain of courses
export type ChainCourse = { id: string; code: string; title: string; semester: number | null };
/**
 * "Open the chain": the courses that need this one (down), what it needs (up), or both, in semester order. Confirmed
 * links come first (ticked); courses reached only through suggested links are listed separately, unticked.
 */
export function chainOf(start: string, courses: ChainCourse[], confirmed: [string, string][], suggested: [string, string][], dir: "down" | "up" | "both") {
  const walk = (edges: [string, string][]) => {
    const seen = new Set<string>([start]); const queue = [start];
    while (queue.length) {
      const c = queue.shift()!;
      for (const [a, b] of edges) {
        const nxt = (dir !== "up" && a === c) ? b : (dir !== "down" && b === c) ? a : null;
        if (nxt && !seen.has(nxt)) { seen.add(nxt); queue.push(nxt); }
      }
    }
    seen.delete(start); return seen;
  };
  const sure = walk(confirmed);
  const maybe = walk(confirmed.concat(suggested));
  const order = (ids: Set<string>) => courses.filter((c) => ids.has(c.id)).sort((a, b) => (a.semester ?? 99) - (b.semester ?? 99) || a.code.localeCompare(b.code));
  const confirmedList = order(sure);
  const suggestedOnly = order(new Set(Array.from(maybe).filter((id) => !sure.has(id))));
  const preview = `${confirmedList.length} course${confirmedList.length === 1 ? "" : "s"}: ${confirmedList.map((c) => `${c.title || c.code} (S${c.semester ?? "?"})`).join(", ")}`;
  return { confirmed: confirmedList, suggestedOnly, preview };
}

// ------------------------------------------------------------------------------------------------ topic performance
export type PerfRow = { courseCode: string; termLabel: string | null; offeredAt: Date | string | null; students: number; avgPct: number | null; belowPct: number | null; questions: number; assessments: number; lectures: number; sections: number };
export type PerfMode = "overall" | "last3" | "last";
const weighted = (rows: PerfRow[]) => {
  const n = rows.reduce((a, r) => a + (r.avgPct == null ? 0 : r.students), 0);
  if (!n) return null;
  return {
    avg: Math.round((10 * rows.reduce((a, r) => a + (r.avgPct ?? 0) * (r.avgPct == null ? 0 : r.students), 0)) / n) / 10,
    below: Math.round((10 * rows.reduce((a, r) => a + (r.belowPct ?? 0) * (r.avgPct == null ? 0 : r.students), 0)) / n) / 10,
    students: n, offerings: rows.filter((r) => r.avgPct != null).length,
  };
};
/** Overall / last 3 / last offering, the trend, and counts. Fewer than `min` students: "too little data". */
export function perfSummary(history: PerfRow[], mode: PerfMode = "overall", min = 30) {
  const rows = history.slice().sort((a, b) => +new Date(a.offeredAt || 0) - +new Date(b.offeredAt || 0));
  const pick = mode === "last" ? rows.slice(-1) : mode === "last3" ? rows.slice(-3) : rows;
  const all = weighted(rows), last3 = weighted(rows.slice(-3)), last = weighted(rows.slice(-1)), shown = weighted(pick);
  const tooLittle = !shown || shown.students < min;
  const trend = rows.length >= 2 && rows[rows.length - 1].avgPct != null && rows[rows.length - 2].avgPct != null ? Math.round(10 * (rows[rows.length - 1].avgPct! - rows[rows.length - 2].avgPct!)) / 10 : null;
  return {
    shown, all, last3, last, trend, tooLittle, heat: tooLittle ? "grey" : heat(shown!.avg),
    questions: rows.reduce((a, r) => a + r.questions, 0), assessments: rows.reduce((a, r) => a + r.assessments, 0),
    offerings: rows.length, sections: rows.reduce((a, r) => a + r.sections, 0),
  };
}
export const heat = (avg: number | null | undefined) => (avg == null ? "grey" : avg < 50 ? "red" : avg < 65 ? "amber" : "green");
/** Lectures spent vs results — only when at least two offerings spent a different number of lectures. */
export function lecturesVsResults(history: PerfRow[]) {
  const by = new Map<number, PerfRow[]>();
  for (const r of history) if (r.avgPct != null && r.lectures > 0) by.set(r.lectures, (by.get(r.lectures) || []).concat(r));
  if (by.size < 2) return null;
  return Array.from(by.entries()).sort((a, b) => a[0] - b[0]).map(([lectures, rs]) => ({ lectures, offerings: rs.length, avg: weighted(rs)!.avg }));
}
/** Sections compared (Program Lead and OMC only): sections under `min` students are left out. */
export function sectionCompare(rows: { section: string; students: number; avgPct: number | null }[], min = 15) {
  return rows.filter((r) => r.students >= min && r.avgPct != null).sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0));
}

// ------------------------------------------------------------------------------------------------ text suggestions (no AI)
export type LinkSuggestion = { fromCode: string; fromTopic: string; toCode: string; toTopic: string; kind: "PREREQ" | "OVERLAP"; level: string; confidence: "High" | "Medium" | "Low"; reason: string };
/**
 * Topic links from wording alone: a topic of an EARLIER-semester course that a later course's topic builds on. Never
 * from a later (or the same) semester. Near-identical wording is a Duplication to review instead.
 */
export function textLinkSuggestions(from: { code: string; semester: number | null; topics: string[] }, to: { code: string; semester: number | null; topics: string[] }, council?: Set<string>): LinkSuggestion[] {
  if (from.semester == null || to.semester == null || from.semester >= to.semester) return [];
  const out: LinkSuggestion[] = [];
  for (const b of to.topics) {
    let best = "", s = 0;
    for (const a of from.topics) { const v = loose(a, b); if (v > s) { s = v; best = a; } }
    if (!best || s < 0.3) continue;
    const inCouncil = council?.has(norm(best)) && council?.has(norm(b));
    if (s >= 0.85) out.push({ fromCode: from.code, fromTopic: best, toCode: to.code, toTopic: b, kind: "OVERLAP", level: "DUPLICATION", confidence: inCouncil ? "Medium" : "Low", reason: `Almost the same wording in S${from.semester} and S${to.semester}` });
    else out.push({ fromCode: from.code, fromTopic: best, toCode: to.code, toTopic: b, kind: "PREREQ", level: s >= 0.6 ? "MILD" : "WEAK", confidence: inCouncil ? "Medium" : "Low", reason: `"${b}" builds on "${best}" (similar wording, ${from.code} is taught earlier)${inCouncil ? "; both in the council outline" : ""}` });
  }
  return out;
}
/** Inside one course: a topic that uses another topic's words but comes before it. */
export function orderSuggestions(topics: string[]) {
  const out: { early: string; late: string; reason: string }[] = [];
  topics.forEach((a, i) => topics.forEach((b, j) => {
    if (j <= i) return;
    const na = norm(a), nb = norm(b);
    if (nb.length >= 4 && na !== nb && na.includes(nb)) out.push({ early: a, late: b, reason: `"${a}" uses "${b}", which is taught later` });
  }));
  return out;
}

// ------------------------------------------------------------------------------------------------ link approvals
export type LinkApproval = { kind: "PREREQ" | "OVERLAP"; level: string; seFromAt?: Date | null; seToAt?: Date | null; plAt?: Date | null };
/** Who still has to agree: both courses' Subject Experts, then the Program Lead; a Strong link also needs 2 OMC approvals. */
export function linkSteps(p: LinkApproval, omcYes: number) {
  const steps = [
    { key: "SE_FROM", label: "SE of the earlier course", done: !!p.seFromAt },
    { key: "SE_TO", label: "SE of the later course", done: !!p.seToAt },
    { key: "PL", label: "Program Lead", done: !!p.plAt },
  ];
  if (p.kind === "PREREQ" && p.level === "STRONG") steps.push({ key: "OMC", label: `OMC (${Math.min(omcYes, 2)} of 2)`, done: omcYes >= 2 });
  return { steps, complete: steps.every((s) => s.done), waiting: steps.filter((s) => !s.done).map((s) => s.label) };
}
