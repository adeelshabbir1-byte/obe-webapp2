// AI checks (Prompt 10, section 8): the prompts the system builds from data it already holds (the person only clicks),
// what a run costs from its token counts, whether the institute's monthly budget allows it, and reading the reply.
// No database and no network here (tested on its own). No personal data is ever put in a prompt: only course content.

export type Kind = "PAPER" | "PLAN" | "SPLIT";
export type Price = { inPerM: number; outPerM: number };
/** Default prices in US$ per million tokens (input / output). The Super Admin edits them to match the price list. */
export const DEFAULT_PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { inPerM: 1, outPerM: 5 },
  "claude-sonnet-5-5": { inPerM: 3, outPerM: 15 },
  "claude-opus-5-5": { inPerM: 5, outPerM: 25 },
};
export const DEFAULT_MODELS: Record<Kind, string> = { PAPER: "claude-haiku-5-5", PLAN: "claude-opus-5-5", SPLIT: "claude-haiku-5-5" };
export const costOf = (model: string, inTok: number, outTok: number, prices: Record<string, Price> = DEFAULT_PRICES) => {
  const p = prices[model] || DEFAULT_PRICES[model] || { inPerM: 5, outPerM: 25 };
  return Math.round(((inTok * p.inPerM + outTok * p.outPerM) / 1e6) * 1e6) / 1e6;
};
/** Refused when this month's spend has reached the cap (a cap of 0 means no AI runs). */
export function budgetLeft(spent: number, cap: number) { return Math.round((cap - spent) * 1e6) / 1e6; }
export const overBudget = (spent: number, cap: number) => budgetLeft(spent, cap) <= 0;
/** A short stable key for "this version" of a paper or plan, so the same version is never paid for twice. */
export function versionKey(x: unknown) {
  const s = JSON.stringify(x); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(36)}-${s.length.toString(36)}`;
}
/** Takes the JSON object out of the model's reply (it may wrap it in prose or a code fence). */
export function readJson<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI reply could not be read.");
  return JSON.parse(m[0]) as T;
}

export type PaperInput = { course: string; exam: string; clos: { code: string; statement: string; bloom: string }[]; topics: string[]; questions: { no: number; text: string; clo: string; bloom: string; marks: number }[] };
export type PaperResult = {
  questions: { q: number; clo: string; level: string; agrees: boolean; fitsClo: boolean; actualBloom: string; claimedBloom: string; topic: string; clarity: string; comment: string; suggestion?: string }[];
  summary: string; paper: { cloCoverage: string; marksPerClo: Record<string, number>; bloomSpread: string; difficulty: string };
};
export function paperPrompt(i: PaperInput) {
  const system = "You are an outcome-based-education reviewer on a university examination committee. Judge each exam question against the course learning outcomes, honestly and briefly. Reply with JSON only.";
  const user = `Course: ${i.course} — ${i.exam} paper\nCLOs:\n${i.clos.map((c) => `${c.code} (${c.bloom}): ${c.statement}`).join("\n")}\nTopics taught:\n${i.topics.slice(0, 40).map((t) => `- ${t}`).join("\n")}\n\nQuestions (the teacher's claimed CLO, Bloom level and marks):\n${i.questions.map((q) => `Q${q.no} [${q.marks} marks] claimed ${q.clo} ${q.bloom}: ${q.text}`).join("\n")}\n\nFor each question say whether it fits the claimed CLO, its actual Bloom level, which taught topic it covers, any clarity problem, and a suggested rewrite when useful. Then summarise the paper: CLO coverage, marks per CLO, Bloom spread and difficulty.\nReply exactly as JSON: {"questions":[{"q":1,"clo":"CLO-1","level":"C3","agrees":true,"fitsClo":true,"actualBloom":"C3","claimedBloom":"C2","topic":"…","clarity":"…","comment":"…","suggestion":"…"}],"summary":"…","paper":{"cloCoverage":"…","marksPerClo":{"CLO-1":20},"bloomSpread":"…","difficulty":"…"}}`;
  return { system, user };
}

export type PlanInput = { course: string; clos: { code: string; statement: string; bloom: string; ga: string | null }[]; lectures: { n: number; topic: string; clo: string | null; importance: string | null }[]; assessments: { type: string; label: string; pct: number; clos: string[] }[]; prerequisites: string[]; council: string[]; weeks: number };
export type PlanResult = { score: number; checks: { area: string; score: number; ok: boolean; findings: string[]; fixes: string[] }[]; summary: string };
export const PLAN_AREAS = ["CLO wording and Bloom level", "Topic → CLO mapping", "Lecture sequence and prerequisites", "Assessment coverage", "Importance and time budget", "Council outline coverage"];
export function planPrompt(i: PlanInput) {
  const system = "You are an experienced curriculum developer reviewing a Subject Expert's course plan for an outcome-based-education committee. Be specific: name the CLO, lecture or assessment and give a concrete fix. Reply with JSON only.";
  const user = `Course: ${i.course} (${i.weeks} weeks)\nCLOs:\n${i.clos.map((c) => `${c.code} (${c.bloom}${c.ga ? `, ${c.ga}` : ""}): ${c.statement}`).join("\n")}\nLecture plan:\n${i.lectures.map((l) => `L${l.n} ${l.topic} → ${l.clo || "no CLO"}${l.importance ? ` [${l.importance}]` : ""}`).join("\n")}\nAssessments:\n${i.assessments.map((a) => `${a.type} ${a.label} ${a.pct}% → ${a.clos.join(", ") || "no CLO"}`).join("\n")}\nPrerequisite topics from earlier courses:\n${i.prerequisites.slice(0, 30).map((p) => `- ${p}`).join("\n") || "- none recorded"}\nCouncil (curriculum) outline topics:\n${i.council.slice(0, 40).map((p) => `- ${p}`).join("\n") || "- none on record"}\n\nScore each area 0–10 with findings and concrete fixes: ${PLAN_AREAS.join("; ")}.\nReply exactly as JSON: {"score":0-100,"checks":[{"area":"…","score":0-10,"ok":true,"findings":["…"],"fixes":["…"]}],"summary":"…"}`;
  return { system, user };
}

/** A canned reply for tests (model "mock" with the test switch on): fixed tokens, so cost and budget can be checked. */
export type SplitInput = { pages: number; size: number };
export type SplitResult = { questions: { no: number; text: string; marks: number | null; parts: { label: string; text: string; marks: number | null }[] }[] };
/** A past paper (PDF, typed or scanned) split into questions and parts, with marks and equations as LaTeX. */
export function splitPrompt(): { system: string; user: string } {
  return {
    system: "You read university exam papers (typed or scanned, including handwriting) and split them into questions exactly as written. Never invent text. Write equations as LaTeX between $ signs. Reply with JSON only.",
    user: 'Split the attached paper into its questions and parts. Reply as {"questions":[{"no":1,"text":"stem (with MCQ options as lines a) …)","marks":5,"parts":[{"label":"a","text":"…","marks":2}]}]}. Use null for marks that are not printed.',
  };
}
export function mockReply(kind: Kind, input: PaperInput | PlanInput | SplitInput): { text: string; inTok: number; outTok: number } {
  if (kind === "SPLIT") {
    const r: SplitResult = { questions: [{ no: 1, text: "Define a stack and give one application.", marks: 5, parts: [] }, { no: 2, text: "Compare arrays and linked lists for insertion.", marks: 10, parts: [] }] };
    return { text: JSON.stringify(r), inTok: 2500, outTok: 300 };
  }
  if (kind === "PAPER") {
    const p = input as PaperInput;
    const r: PaperResult = { questions: p.questions.map((q) => ({ q: q.no, clo: q.clo, level: q.bloom, agrees: true, fitsClo: true, actualBloom: q.bloom, claimedBloom: q.bloom, topic: p.topics[0] || "", clarity: "Clear.", comment: "Fits the claimed CLO.", suggestion: "" })), summary: "Mock review: every question fits its CLO.", paper: { cloCoverage: "All CLOs of this paper are covered.", marksPerClo: Object.fromEntries(p.questions.map((q) => [q.clo, q.marks])), bloomSpread: "Balanced", difficulty: "Medium" } };
    return { text: JSON.stringify(r), inTok: 1200, outTok: 400 };
  }
  const r: PlanResult = { score: 82, checks: PLAN_AREAS.map((area) => ({ area, score: 8, ok: true, findings: ["Mock review."], fixes: [] })), summary: "Mock plan review." };
  return { text: JSON.stringify(r), inTok: 3000, outTok: 900 };
}
