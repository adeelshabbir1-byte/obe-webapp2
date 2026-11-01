import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { DEFAULT_MODELS, DEFAULT_PRICES, costOf, overBudget, versionKey, readJson, paperPrompt, planPrompt, mockReply, type Kind, type PaperInput, type PlanInput, type PaperResult, type PlanResult, type Price } from "./aiChecksCore";

// AI checks with the university's own API key (ANTHROPIC_API_KEY in Vercel, or the institute's AI Configuration): the
// Instructor's "AI check" of a mid / final paper and the SE's "AI review" of the plan. The prompt is built from data the
// system already holds; results are cached per version; each run is logged with its tokens and cost; a monthly budget
// per institute stops runs once used up. The models (cheaper for papers, stronger for plans) and prices are settings.

const db = prisma as unknown as Record<string, any>;
export type AiSettings = { enabled: boolean; monthlyBudgetUsd: number; paperModel: string; planModel: string; prices: Record<string, Price> };

export async function settingsOf(chairmanId: string): Promise<AiSettings> {
  const r = await db.aiCheckSetting?.findUnique({ where: { chairmanId } }).catch(() => null);
  let prices: Record<string, Price> = {};
  try { prices = r ? JSON.parse(r.pricesJson || "{}") : {}; } catch { prices = {}; }
  return { enabled: r ? !!r.enabled : true, monthlyBudgetUsd: r ? Number(r.monthlyBudgetUsd) : 20, paperModel: r?.paperModel || DEFAULT_MODELS.PAPER, planModel: r?.planModel || DEFAULT_MODELS.PLAN, prices: { ...DEFAULT_PRICES, ...prices } };
}
export async function saveSettings(chairmanId: string, s: Partial<AiSettings>, by: string) {
  const cur = await settingsOf(chairmanId);
  const n = { ...cur, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) } as AiSettings;
  const data = { enabled: !!n.enabled, monthlyBudgetUsd: Math.max(0, Number(n.monthlyBudgetUsd) || 0), paperModel: String(n.paperModel).slice(0, 80), planModel: String(n.planModel).slice(0, 80), pricesJson: JSON.stringify(n.prices || {}), updatedById: by, updatedAt: new Date() };
  await db.aiCheckSetting.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data });
}
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export async function spentThisMonth(chairmanId: string) {
  const r = await db.aiUsage?.aggregate({ where: { chairmanId, createdAt: { gte: monthStart() } }, _sum: { costUsd: true } }).catch(() => null);
  return Number(r?._sum?.costUsd || 0);
}
async function keyFor(chairmanId: string) {
  const c = await db.aiConfig?.findUnique({ where: { chairmanId } }).catch(() => null);
  return c?.enabled && c.apiKey ? String(c.apiKey) : process.env.ANTHROPIC_API_KEY || null;
}

/** One AI run: cache (same version → no new cost), budget, the call, the usage log. */
async function run<T>(a: { chairmanId: string; userId: string; kind: Kind; courseId: string; input: PaperInput | PlanInput; build: () => { system: string; user: string }; document?: { data: string; mediaType: string } | null }): Promise<{ result: T; cached: boolean; costUsd: number; model: string }> {
  const s = await settingsOf(a.chairmanId);
  if (!s.enabled) throw new Error("AI checks are switched off for this institute.");
  const model = a.kind === "PAPER" ? s.paperModel : s.planModel;
  const vk = versionKey({ input: a.input, doc: a.document ? a.document.data.length : 0, model });
  const key = `${a.kind}|${a.courseId}|${vk}`;
  const hit = await db.aiCheckCache?.findUnique({ where: { key } }).catch(() => null);
  if (hit) {
    await db.aiUsage.create({ data: { id: randomUUID(), chairmanId: a.chairmanId, userId: a.userId, kind: a.kind, courseId: a.courseId, versionKey: vk, model, cached: true } }).catch(() => null);
    return { result: JSON.parse(hit.resultJson) as T, cached: true, costUsd: 0, model };
  }
  const spent = await spentThisMonth(a.chairmanId);
  if (overBudget(spent, s.monthlyBudgetUsd)) throw new Error(`This month's AI budget (US$ ${s.monthlyBudgetUsd}) is used up (US$ ${spent.toFixed(2)} spent). It renews on the 1st; the Super Admin can raise it.`);
  let text = "", inTok = 0, outTok = 0;
  if (model === "mock" && process.env.E2E_TEST_ROUTES === "1") ({ text, inTok, outTok } = mockReply(a.kind, a.input));
  else {
    const apiKey = await keyFor(a.chairmanId);
    if (!apiKey) throw new Error("No AI key: set ANTHROPIC_API_KEY in Vercel (or the institute's AI Configuration).");
    const { system, user } = a.build();
    const client = new Anthropic({ apiKey, timeout: 90000, maxRetries: 1 });
    const content: Anthropic.MessageParam["content"] = a.document ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.document.data } } as never, { type: "text", text: user }] : user;
    try {
      const r = await client.messages.create({ model, max_tokens: 8000, system, messages: [{ role: "user", content }] });
      text = r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      inTok = r.usage.input_tokens; outTok = r.usage.output_tokens;
    } catch (e) {
      await db.aiUsage.create({ data: { id: randomUUID(), chairmanId: a.chairmanId, userId: a.userId, kind: a.kind, courseId: a.courseId, versionKey: vk, model, error: String((e as Error).message).slice(0, 300) } }).catch(() => null);
      throw new Error(`The AI service could not answer: ${(e as Error).message}`);
    }
  }
  const costUsd = costOf(model, inTok, outTok, s.prices);
  await db.aiUsage.create({ data: { id: randomUUID(), chairmanId: a.chairmanId, userId: a.userId, kind: a.kind, courseId: a.courseId, versionKey: vk, model, inputTokens: inTok, outputTokens: outTok, costUsd } });
  const result = readJson<T>(text);
  await db.aiCheckCache.upsert({ where: { key }, create: { key, chairmanId: a.chairmanId, kind: a.kind, courseId: a.courseId, resultJson: JSON.stringify(result) }, update: { resultJson: JSON.stringify(result), createdAt: new Date() } }).catch(() => null);
  return { result, cached: false, costUsd, model };
}

/** The paper's questions with the course's CLOs, Bloom levels, topics and marks (or an uploaded sample paper, PDF). */
export async function paperCheck(user: { id: string }, chairmanId: string, course: { id: string; code: string; title: string }, examType: string, questions: { no: number; text: string; clo: string; bloom: string; marks: number }[], pdfBase64?: string | null) {
  const [clos, rows] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" }, select: { code: true, statement: true, bloomLevel: true } }),
    prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" }, select: { topic: true } }),
  ]);
  const input: PaperInput = { course: `${course.code} ${course.title}`, exam: examType, clos: clos.map((c) => ({ code: c.code, statement: c.statement, bloom: c.bloomLevel || "" })), topics: rows.map((r) => r.topic), questions };
  if (!questions.length && !pdfBase64) throw new Error("Write the questions (or upload a sample paper) first.");
  return run<PaperResult>({ chairmanId, userId: user.id, kind: "PAPER", courseId: course.id, input, build: () => paperPrompt(input), document: pdfBase64 ? { data: pdfBase64, mediaType: "application/pdf" } : null });
}

/** The SE plan: CLOs with Bloom and GA, the lecture plan (topic → CLO, importance), assessments, prerequisites, council outline. */
export async function planReview(user: { id: string }, chairmanId: string, courseId: string) {
  const c = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, code: true, title: true, coordinatorId: true } });
  const [clos, rows, insts, links, prereqs] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, statement: true, bloomLevel: true, mappedPlo: { select: { number: true } } } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { id: true, lectureNumber: true, week: true, topic: true, cloId: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE" }, select: { id: true, type: true, label: true, marksPct: true } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId, source: "SE" } }, select: { instrumentId: true, lectureRow: { select: { cloId: true } } } }),
    prisma.topicPrerequisite.findMany({ where: { coordinatorId: c.coordinatorId, dependentCourseCode: c.code }, select: { prereqCourseCode: true, prereqTopic: true, dependentTopic: true } }).catch(() => []),
  ]);
  const meta = new Map(((await db.topicMeta?.findMany({ where: { lectureRowId: { in: rows.map((r) => r.id).concat("none") } } }).catch(() => [])) as { lectureRowId: string; importance: string | null }[]).map((m) => [m.lectureRowId, m.importance]));
  const code = new Map(clos.map((x) => [x.id, x.code]));
  const council = await (async () => { const m = await prisma.course.findUnique({ where: { id: courseId }, select: { masterCourseId: true } }).catch(() => null) as { masterCourseId?: string | null } | null; return m?.masterCourseId ? (await prisma.masterCourseTopic.findMany({ where: { masterCourseId: m.masterCourseId }, select: { topic: true } })).map((t) => t.topic) : []; })().catch(() => [] as string[]);
  const input: PlanInput = {
    course: `${c.code} ${c.title}`, weeks: Math.max(...rows.map((r) => r.week), 0),
    clos: clos.map((x) => ({ code: x.code, statement: x.statement, bloom: x.bloomLevel || "", ga: x.mappedPlo ? `GA-${x.mappedPlo.number}` : null })),
    lectures: rows.map((r) => ({ n: r.lectureNumber, topic: r.topic, clo: r.cloId ? code.get(r.cloId) || null : null, importance: meta.get(r.id) || null })),
    assessments: insts.map((i) => ({ type: i.type, label: i.label, pct: i.marksPct, clos: Array.from(new Set(links.filter((l) => l.instrumentId === i.id && l.lectureRow.cloId).map((l) => code.get(l.lectureRow.cloId!) || ""))).filter(Boolean) })),
    prerequisites: prereqs.map((p) => `${p.prereqCourseCode} "${p.prereqTopic}" → "${p.dependentTopic}"`), council,
  };
  return run<PlanResult>({ chairmanId, userId: user.id, kind: "PLAN", courseId, input, build: () => planPrompt(input) });
}

/** The Super Admin's view: this month's spend per institute and the latest runs. */
export async function usageOverview() {
  const rows = (await db.aiUsage?.findMany({ where: { createdAt: { gte: monthStart() } }, orderBy: { createdAt: "desc" }, take: 300 }).catch(() => [])) as { id: string; chairmanId: string; userId: string; kind: string; courseId: string | null; model: string; inputTokens: number; outputTokens: number; costUsd: number; cached: boolean; error: string | null; createdAt: Date }[];
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" as never }, select: { id: true, name: true, instituteName: true } });
  const perInst = await Promise.all(heads.map(async (h) => ({ id: h.id, name: h.instituteName || h.name, settings: await settingsOf(h.id), spent: Math.round(rows.filter((r) => r.chairmanId === h.id).reduce((s, r) => s + r.costUsd, 0) * 10000) / 10000, runs: rows.filter((r) => r.chairmanId === h.id).length })));
  return { perInst, rows };
}
