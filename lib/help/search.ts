import { EVERYONE, forAudience, type HelpArticle } from "./types";

// Help search, entirely local: no AI needed, works offline and costs nothing per query.
// Text is tokenized, lightly stemmed and expanded with synonyms ("teacher" ~ "faculty", "can't" ~ "blocked"),
// then ranked with BM25 over weighted fields (title and keywords count most). Close misspellings still match.
// The viewer's role and the page they are on raise the articles written for them. An optional AI step
// (lib/help/rerank.ts) may then reorder the top results; it can only choose among these articles.

const STOP = new Set(("a an the is are am was were be been do does did i me my mine we our you your it its this that these those to of for in on at by " +
  "with from as and or if then so about into there here please can could would should will shall may might must need want how what why who whom " +
  "where when which whose any some get got have has had make made also just only one really very not dont doesnt im ive").split(" "));

// Words that mean the same thing to someone asking for help. Each group's words are stemmed like everything else.
const SYNONYMS: string[][] = [
  ["password", "passwd", "pwd", "passcode", "credential", "credentials", "pin"],
  ["reset", "forgot", "forget", "forgotten", "recover", "recovery", "lost", "restore"],
  ["login", "signin", "sign-in", "logon", "log-in", "sign", "signon"],
  ["lock", "locked", "lockout", "suspended", "frozen"],
  ["mfa", "2fa", "otp", "authenticator", "two-step", "two-factor", "twofactor", "verification", "2-step"],
  ["add", "create", "new", "provision", "onboard", "onboarding", "invite", "appoint", "setup"],
  ["remove", "delete", "deactivate", "disable", "revoke", "terminate"],
  ["teacher", "faculty", "instructor", "lecturer", "professor", "tutor", "teaching"],
  ["student", "learner", "pupil", "undergraduate"],
  ["weight", "weightage", "weighting", "weights", "distribution"],
  ["approve", "approval", "accept", "authorise", "authorize", "signoff", "sign-off", "endorse"],
  ["block", "blocked", "cannot", "cant", "unable", "stuck", "denied", "prevented", "restricted", "disallowed"],
  ["registration", "register", "enroll", "enrol", "enrollment", "enrolment", "add-drop", "adddrop"],
  ["exam", "examination", "datesheet", "date-sheet", "midterm", "final", "paper", "invigilation"],
  ["result", "grade", "grades", "marks", "gpa", "cgpa"],
  ["hod", "chairman", "head"],
  ["admin", "administrator", "superuser", "super-user", "it"],
  ["role", "permission", "access", "right", "privilege", "authority"],
  ["fyp", "capstone", "project", "thesis"],
  ["panel", "evaluator", "examiner", "jury", "evaluation"],
  ["prerequisite", "prereq", "pre-requisite", "prerequisites", "dependency", "dependent"],
  ["ticket", "support", "helpdesk", "help-desk", "complaint", "issue", "escalate", "contact"],
  ["timetable", "schedule", "routine", "clash"],
  ["leave", "absence", "absent", "substitute"],
  ["course", "subject", "module"],
  ["clo", "clos", "outcome", "outcomes", "plo", "plos"],
  ["change", "edit", "modify", "update", "alter", "adjust"],
  ["policy", "rule", "rules", "criteria", "regulation"],
  ["report", "reports", "export", "excel", "print"],
  ["fee", "fees", "finance", "payment", "scholarship", "budget"],
  ["email", "mail", "e-mail", "notification", "notify", "alert"],
];

/** Light stemming: enough to make "approved", "approval" and "approves" meet, without a dictionary. */
export function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 6 && s.endsWith("al")) s = s.slice(0, -2);
  else if (s.length > 7 && s.endsWith("ment")) s = s.slice(0, -4);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

const normalize = (t: string) => t.toLowerCase().replace(/[’‘`]/g, "'").replace(/can't|cannot|can not/g, "cant").replace(/won't/g, "wont").replace(/n't\b/g, "nt");

/** Words of a text, lowercased, without stop words, stemmed. Hyphenated words also count as one ("two-step"). */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).split(/[^a-z0-9'-]+/)) {
    const w = raw.replace(/^['-]+|['-]+$/g, "").replace(/'s$/, "").replace(/'/g, "");
    if (!w || STOP.has(w)) continue;
    if (w.includes("-")) {
      out.push(stem(w));
      for (const part of w.split("-")) if (part && !STOP.has(part) && part.length > 1) out.push(stem(part));
    } else if (w.length > 1 || /\d/.test(w)) out.push(stem(w));
  }
  return out;
}

const GROUP_OF = new Map<string, string>();
SYNONYMS.forEach((g, i) => { for (const w of g) for (const t of tokens(w)) if (!GROUP_OF.has(t)) GROUP_OF.set(t, `~${i}`); });

type Field = { text: string; weight: number };
const fieldsOf = (a: HelpArticle): Field[] => [
  { text: a.title, weight: 3 },
  { text: (a.keywords || []).join(" "), weight: 2.5 },
  { text: a.summary, weight: 1.2 },
  { text: [...(a.steps || []), a.who || "", a.affects || ""].join(" "), weight: 0.7 },
];

type Doc = { a: HelpArticle; tf: Map<string, number>; len: number; phrases: string[] };

function index(a: HelpArticle): Doc {
  const tf = new Map<string, number>();
  let len = 0;
  for (const f of fieldsOf(a)) {
    for (const t of tokens(f.text)) {
      tf.set(t, (tf.get(t) || 0) + f.weight);
      const g = GROUP_OF.get(t);
      if (g) tf.set(g, (tf.get(g) || 0) + f.weight * 0.6);
      len += f.weight;
    }
  }
  const phrases = (a.keywords || []).map((k) => tokens(k).join(" ")).filter((p) => p.includes(" "));
  return { a, tf, len, phrases };
}

// Built-in articles are indexed once per process; an institute's own articles are cheap to index per request.
const cache = new WeakMap<HelpArticle, Doc>();
const docOf = (a: HelpArticle) => { let d = cache.get(a); if (!d) { d = index(a); cache.set(a, d); } return d; };

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type SearchHit = { article: HelpArticle; score: number; matched: string[] };
export type SearchContext = { role: string; path?: string };

/** Articles whose pages include the current path, the most specific page first. */
export function pageMatch(a: HelpArticle, path?: string): number {
  if (!path || !a.pages?.length) return 0;
  let best = 0;
  for (const p of a.pages) if (path === p || path.startsWith(p.endsWith("/") ? p : p + "/") || path.startsWith(p + "?")) best = Math.max(best, p.length);
  return best;
}

export function searchArticles(all: HelpArticle[], query: string, ctx: SearchContext, limit = 8): SearchHit[] {
  const docs = all.filter((a) => forAudience(a, ctx.role)).map(docOf);
  const q = tokens(query);
  if (!q.length || !docs.length) return [];
  const N = docs.length;
  const avg = docs.reduce((s, d) => s + d.len, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of Array.from(d.tf.keys())) df.set(t, (df.get(t) || 0) + 1);
  const vocab = Array.from(df.keys()).filter((t) => !t.startsWith("~"));

  // Each query word is looked up as itself, as its synonym group, and (if unknown) as its nearest spelling.
  const terms: { term: string; weight: number; word: string }[] = [];
  for (const w of Array.from(new Set(q))) {
    terms.push({ term: w, weight: 1, word: w });
    const g = GROUP_OF.get(w);
    if (g) terms.push({ term: g, weight: 0.7, word: w });
    if (!df.has(w) && !g && w.length >= 5) {
      const max = w.length >= 8 ? 2 : 1;
      const near = vocab.map((v) => ({ v, d: editDistance(w, v, max) })).filter((x) => x.d <= max).sort((x, y) => x.d - y.d).slice(0, 2);
      for (const n of near) {
        terms.push({ term: n.v, weight: 0.55, word: w });
        const ng = GROUP_OF.get(n.v);
        if (ng) terms.push({ term: ng, weight: 0.4, word: w });
      }
    }
  }
  const k1 = 1.2, b = 0.75;
  const qText = q.join(" ");
  const intent = normalize(query).trim();
  const asksWho = /^(who|which role)\b/.test(intent), asksHow = /^(how|steps|guide)\b/.test(intent), asksWhy = /^why\b/.test(intent);
  // "my password" is about the asker; "someone's password" about another person — the two have different answers.
  const aboutSelf = /\b(i|my|me|mine|myself)\b/.test(intent) && !/\b(someone|somebody|another|other|others|colleague|user's|student's|teacher's)\b/.test(intent);
  const aboutOthers = /\b(someone|somebody|another|other|colleague|user's|student's|teacher's)\b/.test(intent);
  const firstPerson = (title: string) => /\b(i|my|me)\b/i.test(title);

  const hits: SearchHit[] = [];
  for (const d of docs) {
    let score = 0;
    const matched = new Set<string>();
    const seenTerm = new Set<string>();
    for (const t of terms) {
      if (seenTerm.has(t.term)) continue;
      const f = d.tf.get(t.term);
      if (!f) continue;
      seenTerm.add(t.term);
      const n = df.get(t.term) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += t.weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg)));
      matched.add(t.word);
    }
    if (!score) continue;
    // Coverage: an article matching every word of the question beats one matching a single word many times.
    score *= 0.5 + 0.5 * (matched.size / Math.max(1, new Set(q).size));
    for (const p of d.phrases) if (qText.includes(p)) score *= 1.25;
    if (asksWho && (d.a.title.toLowerCase().startsWith("who") || d.a.who)) score *= 1.12;
    if (asksHow && d.a.kind === "guide") score *= 1.1;
    if (asksWhy && d.a.kind === "faq") score *= 1.1;
    if (aboutSelf && firstPerson(d.a.title)) score *= 1.2;
    if (aboutOthers && !firstPerson(d.a.title)) score *= 1.1;
    if (d.a.roles.includes(ctx.role)) score *= 1.12;
    if (pageMatch(d.a, ctx.path)) score *= 1.2;
    hits.push({ article: d.a, score, matched: Array.from(matched) });
  }
  hits.sort((x, y) => y.score - x.score || x.article.title.localeCompare(y.article.title));
  const top = hits[0]?.score || 0;
  return hits.filter((h) => h.score >= top * 0.22).slice(0, limit);
}

/** What to show before anything is typed: the articles for this page, then the ones written for this role. */
export function suggestFor(all: HelpArticle[], ctx: SearchContext, limit = 6): HelpArticle[] {
  const mine = all.filter((a) => forAudience(a, ctx.role));
  // Written for this role (or for everyone) beats written for staff in general; otherwise the manual's own order.
  const targeted = (a: HelpArticle) => a.roles.includes(ctx.role) || a.roles.includes(EVERYONE);
  const onPage = mine.map((a, i) => ({ a, i, m: pageMatch(a, ctx.path) })).filter((x) => x.m > 0).sort((x, y) => y.m - x.m || Number(targeted(y.a)) - Number(targeted(x.a)) || x.i - y.i);
  const out = onPage.map((x) => x.a);
  if (out.length < limit) for (const a of mine) if (!out.includes(a) && a.roles.includes(ctx.role)) out.push(a);
  if (out.length < limit) for (const a of mine) if (!out.includes(a) && !a.roles.length) out.push(a);
  return out.slice(0, limit);
}
