// Course Catalog rules with no database: the professional code, topic matching by meaning (synonyms and word stems),
// generic lectures that never count as overlaps, overlap classification (Progression / Duplication), search with the
// matched field, and highlighting.

export type Field = "COMPUTING" | "MANAGEMENT" | "ENGINEERING";
export type Importance = "CORE" | "IMPORTANT" | "OPTIONAL";
export type Strength = "STRONG" | "MILD" | "WEAK";
export type CatClo = { n: number; statement: string; bloom: string; gas: number[]; source: string };
export type CatLecture = { n: number; topic: string; sub: string; clo: number | null; importance: Importance; chapter: string | null; pr: string | null };
export type CatPrereq = { code: string | null; title: string; strength: Strength; reason: string };
export type CatTopicLink = { lecture: number; fromCode: string; fromLecture: number; strength: Strength; within: boolean };
export type CatBook = { title: string; kind: "TEXT" | "REFERENCE" };
export type CatalogEntry = {
  id: string; field: Field; discipline: string; code: string; title: string; level: number; area: number; serial: number;
  creditHours: number; theoryCh: number; labCh: number; semester: number | null; semesterReason: string | null;
  gaSet: "CGA" | "BGA" | "EGA"; source: string; sourceNote: string | null; instituteCodes: { code: string; of: string }[];
  clos: CatClo[]; lectures: CatLecture[]; prereqs: CatPrereq[]; topicLinks: CatTopicLink[]; books: CatBook[]; version: number;
};

export const FIELDS: Record<Field, { label: string; prefix: string; gaSet: "CGA" | "BGA" | "EGA"; areas: string[] }> = {
  COMPUTING: { label: "Computing", prefix: "CMP", gaSet: "CGA", areas: ["Computing foundations & ICT", "Programming & software construction", "Algorithms & theory", "Systems & architecture", "Networks & security", "Data & databases", "Intelligent systems", "Software engineering & HCI", "Mathematics & science", "General education & professional practice"] },
  MANAGEMENT: { label: "Management Sciences", prefix: "MGS", gaSet: "BGA", areas: ["Management & organisation", "Accounting", "Finance & banking", "Marketing", "Human resource management", "Operations & supply chain", "Economics", "Business analytics & information systems", "Quantitative methods & research", "General education, law, ethics & projects"] },
  ENGINEERING: { label: "Engineering", prefix: "EGR", gaSet: "EGA", areas: ["Engineering foundations", "Electrical", "Mechanical", "Civil", "Chemical", "Computer", "Software", "Industrial", "Mathematics & science", "Humanities, management & projects"] },
};
/** "CMP-251": field prefix, then level (year of study), area, serial within that level and area. */
export const makeCode = (field: Field, level: number, area: number, serial: number) => `${FIELDS[field].prefix}-${level}${area}${serial}`;
export const CODE_RULE = "Field prefix (CMP Computing, MGS Management Sciences, EGR Engineering) – level (year of study, 1–4) – area (0–9, the field's subject areas) – serial within that level and area. CMP-251 = Computing, year 2, area 5 (Data & databases), first course. The institute's own codes are kept beside it.";
export const levelOf = (semester: number | null | undefined) => Math.min(4, Math.max(1, Math.ceil((semester || 1) / 2)));

// ---- topic meaning
const STOP = new Set("a an the and or of to in on for with by from as at into is are its their using use basic basics introduction intro overview concept concepts part i ii iii iv continued review fundamental fundamentals principle principles application applications practice exercise exercises example examples case study various type types it this that how what etc summary summaries definition definitions trend trends frontier frontiers".split(" "));
/** Words that alone never make two topics the same. */
const GENERIC = new Set("system design analysi analysis method model data management process theory structure technique tool issue problem solution program language implementation algorithm operation function application network control computer software engineering business".split(" "));
const SYNONYMS: [RegExp, string][] = [
  [/\blist adts?\b|\badt list\b|\blinked[- ]?lists?\b/g, "linked list"],
  [/\bbig[- ]?(oh|o)\b|\basymptotic (notation|analysis)\b/g, "asymptotic notation"],
  [/\bobject[- ]oriented programming\b|\boop\b/g, "object oriented"],
  [/\bdbms\b|\bdatabase management systems?\b/g, "database"],
  [/\bbsts?\b/g, "binary search tree"], [/\bdfs\b/g, "depth first search"], [/\bbfs\b/g, "breadth first search"],
  [/\bneural nets?\b|\banns?\b/g, "neural network"], [/\bml\b/g, "machine learning"], [/\bos\b/g, "operating system"],
  [/\bhashing\b|\bhash tables?\b/g, "hash"], [/\bpqs?\b|\bpriority queues?\b/g, "priority queue"],
  [/\bdeadlocks?\b/g, "deadlock"], [/\bsdlc\b|\bsoftware (development )?life ?cycles?\b/g, "life cycle"],
  [/\bnpv\b/g, "net present value"], [/\birr\b/g, "internal rate return"], [/\bcvp\b/g, "cost volume profit"],
  [/\bhrm\b/g, "human resource"], [/\bscm\b/g, "supply chain"], [/\bkcl\b/g, "kirchhoff current"], [/\bkvl\b/g, "kirchhoff voltage"],
];
export const stem = (w: string) => (w.length <= 4 ? w : w.replace(/ies$/, "y").replace(/(ing|ed)$/, "").replace(/sses$/, "ss").replace(/([^s])s$/, "$1"));
export function tokens(t: string): Set<string> {
  let s = ` ${(t || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#/ -]+/g, " ").replace(/[-/]/g, " ")} `;
  for (const [re, to] of SYNONYMS) s = s.replace(re, ` ${to} `);
  return new Set(s.split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem).filter((w) => !STOP.has(w)));
}
/** How alike two topics are in meaning, 0–1 (containment weighted with overlap). */
export function topicSimilarity(a: string | Set<string>, b: string | Set<string>) {
  const A = typeof a === "string" ? tokens(a) : a, B = typeof b === "string" ? tokens(b) : b;
  if (!A.size || !B.size) return 0;
  const shared = Array.from(A).filter((w) => B.has(w));
  if (!shared.length || shared.every((w) => GENERIC.has(w))) return 0;
  const contain = shared.length / Math.min(A.size, B.size), jac = shared.length / (A.size + B.size - shared.length);
  // One shared word against a long topic is weak evidence ("Recursion" vs "Recursion and analysing recursive algorithms").
  const weak = shared.length === 1 && Math.max(A.size, B.size) >= 3 ? 0.85 : 1;
  return Math.round((0.7 * contain + 0.3 * jac) * weak * 100) / 100;
}

// ---- generic lectures (review, revision, recap …) — never overlaps
export const DEFAULT_STOP_LIST = ["Review", "Revision", "Recap", "Course review", "Mid-term review", "Introduction to the course", "Final review"];
const nrm = (t: string) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function isGeneric(topic: string, extra: string[] = []) {
  const t = nrm(topic);
  if (!t) return true;
  if (/^((mid ?term|midterm|final|course|semester|exam|examination|unit|chapter)\s+)*(exam(ination)?s?\s+)?(review|revision|recap|wrap up)\b/.test(t)) return true;
  if (/^(introduction to|overview of) (the|this) course\b|^course (introduction|overview|orientation|outline)\b/.test(t)) return true;
  if (/^(mid ?term|midterm|final|sessional|terminal)( term)? (exam|examination|test)s?$|^quiz( \d+)?$/.test(t)) return true;
  if (/^(final |course |mid ?term )?(project )?(presentation|presentations|exam preparation|preparation for (the )?(final|mid ?term)( exam)?|wrap up|summary)s?$/.test(t)) return true;
  if (/^(final|mid ?term|midterm) (exam|examination) (preparation|review)$/.test(t)) return true;
  if (/^(final |mid ?term |midterm |course )?(assessment|assessments|case stud(y|ies)|project work|lab exam)$/.test(t)) return true;
  return [...DEFAULT_STOP_LIST, ...extra].some((s) => { const x = nrm(s); return x && (t === x || t.startsWith(`${x} `)); });
}

export type Overlap = { a: { code: string; title: string; lecture: number; topic: string }; b: { code: string; title: string; lecture: number; topic: string }; kind: "PROGRESSION" | "DUPLICATION"; confidence: number; reason: string; by: "WORDING" | "AI" };
type Lite = Pick<CatalogEntry, "code" | "title" | "semester" | "prereqs" | "lectures">;
/** Every course's prerequisites, followed back through the chain. */
export function ancestors(entries: Lite[]) {
  const by = new Map(entries.map((e) => [e.code, e]));
  const memo = new Map<string, Set<string>>();
  const walk = (code: string, seen: Set<string>): Set<string> => {
    if (memo.has(code)) return memo.get(code)!;
    const out = new Set<string>();
    for (const p of by.get(code)?.prereqs || []) if (p.code && !seen.has(p.code)) { out.add(p.code); seen.add(p.code); walk(p.code, seen).forEach((x) => out.add(x)); }
    memo.set(code, out);
    return out;
  };
  for (const e of entries) walk(e.code, new Set([e.code]));
  return memo;
}
const topicText = (l: { topic: string; sub: string }) => (l.sub && !/^(concepts|applications|continued|practice)/i.test(l.sub) ? `${l.topic} ${l.sub}` : l.topic);
/**
 * Topics taught in two courses. Progression: the later course has the earlier one as a prerequisite (or adds detail
 * to the same topic) — fine, but worth knowing. Duplication: the same topic with no prerequisite link between the
 * courses. Generic lectures (review, recap …) and the stop-list never count.
 */
export function findOverlaps(entries: Lite[], stopList: string[] = [], min = 0.75, onlyCode?: string): Overlap[] {
  const anc = ancestors(entries);
  const items: { e: Lite; l: CatLecture; tok: Set<string> }[] = [];
  for (const e of entries) for (const l of e.lectures) if (!isGeneric(l.topic, stopList)) items.push({ e, l, tok: tokens(topicText(l)) });
  const index = new Map<string, number[]>();
  items.forEach((it, i) => it.tok.forEach((w) => { if (!GENERIC.has(w)) index.set(w, [...(index.get(w) || []), i]); }));
  const best = new Map<string, Overlap>();
  items.forEach((x, i) => {
    if (onlyCode && x.e.code !== onlyCode) return;
    const cands = new Set<number>();
    x.tok.forEach((w) => (index.get(w) || []).forEach((j) => { if (onlyCode ? j !== i : j > i) cands.add(j); }));
    for (const j of Array.from(cands)) {
      const y = items[j];
      if (y.e.code === x.e.code) continue;
      if (x.e.code.slice(0, 3) !== y.e.code.slice(0, 3) && !anc.get(x.e.code)?.has(y.e.code) && !anc.get(y.e.code)?.has(x.e.code)) continue;
      const s = topicSimilarity(x.tok, y.tok);
      if (s < min) continue;
      const [early, late] = (x.e.semester ?? 9) <= (y.e.semester ?? 9) ? [x, y] : [y, x];
      const linked = anc.get(late.e.code)?.has(early.e.code) || anc.get(early.e.code)?.has(late.e.code);
      const extra = Array.from(late.tok).filter((w) => !early.tok.has(w));
      let kind: Overlap["kind"], reason: string, conf = s;
      if (linked) { kind = "PROGRESSION"; reason = `${late.e.code} has ${early.e.code} as a prerequisite: the later course ${extra.length ? `builds on the topic (adds: ${extra.slice(0, 4).join(", ")})` : "repeats the topic — keep it short there"}.`; }
      else if (extra.length && Array.from(early.tok).every((w) => late.tok.has(w)) && (early.e.semester ?? 0) < (late.e.semester ?? 0)) { kind = "PROGRESSION"; conf = s * 0.85; reason = `The later course adds detail (${extra.slice(0, 4).join(", ")}) but the courses are not linked as prerequisites — consider linking them.`; }
      else { kind = "DUPLICATION"; reason = "Taught in both courses with no prerequisite link between them."; }
      const o: Overlap = { a: { code: early.e.code, title: early.e.title, lecture: early.l.n, topic: early.l.topic }, b: { code: late.e.code, title: late.e.title, lecture: late.l.n, topic: late.l.topic }, kind, confidence: Math.round(conf * 100), reason, by: "WORDING" };
      const key = `${o.a.code}|${o.a.topic.toLowerCase()}|${o.b.code}|${o.b.topic.toLowerCase()}`;
      if (!best.has(key)) best.set(key, o);
    }
  });
  return Array.from(best.values()).sort((p, q) => q.confidence - p.confidence);
}

// ---- search
export type SearchField = "code" | "title" | "topic" | "clo" | "book";
export const FIELD_COLOUR: Record<SearchField, string> = { code: "#FFE08A", title: "#BFE3C9", topic: "#C9DCF5", clo: "#F2C9DF", book: "#E3D3F5" };
export type SearchHit = { entry: CatalogEntry; matches: { field: SearchField; text: string; where?: string }[]; score: number };
const words = (q: string) => (q || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9+#.\-]/g, "")).filter(Boolean);
const has = (text: string, ws: string[]) => { const t = (text || "").toLowerCase(); return ws.every((w) => t.includes(w)); };
export function searchCatalog(entries: CatalogEntry[], q: string, f: { field?: string; level?: number; semester?: number; hasPrereq?: boolean } = {}): SearchHit[] {
  const ws = words(q);
  const out: SearchHit[] = [];
  for (const e of entries) {
    if (f.field && e.field !== f.field) continue;
    if (f.level && e.level !== f.level) continue;
    if (f.semester && e.semester !== f.semester) continue;
    if (f.hasPrereq !== undefined && f.hasPrereq !== e.prereqs.length > 0) continue;
    if (!ws.length) { out.push({ entry: e, matches: [], score: 0 }); continue; }
    const m: SearchHit["matches"] = [];
    for (const c of [e.code, ...e.instituteCodes.map((x) => x.code)]) if (has(c, ws)) m.push({ field: "code", text: c });
    if (has(e.title, ws)) m.push({ field: "title", text: e.title });
    for (const l of e.lectures) { const t = l.sub ? `${l.topic} — ${l.sub}` : l.topic; if (has(t, ws)) m.push({ field: "topic", text: t, where: `L${l.n}` }); }
    for (const c of e.clos) if (has(c.statement, ws)) m.push({ field: "clo", text: c.statement, where: `CLO-${c.n}` });
    for (const b of e.books) if (has(b.title, ws)) m.push({ field: "book", text: b.title });
    if (!m.length) continue;
    const w = { code: 50, title: 30, clo: 6, topic: 5, book: 4 } as const;
    out.push({ entry: e, matches: m, score: m.reduce((s, x) => s + w[x.field], 0) });
  }
  return out.sort((a, b) => b.score - a.score || a.entry.code.localeCompare(b.entry.code));
}
/** The text cut into plain and matched pieces, for colouring the match. */
export function highlight(text: string, q: string): { t: string; hit: boolean }[] {
  const ws = words(q).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ws.length || !text) return [{ t: text || "", hit: false }];
  const split = new RegExp(`(${ws.join("|")})`, "i"), whole = new RegExp(`^(${ws.join("|")})$`, "i");
  return text.split(split).filter((p) => p !== "").map((p) => ({ t: p, hit: whole.test(p) }));
}
