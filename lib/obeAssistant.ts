import { prisma } from "./db";
import { courseChain } from "./outcomeFlow";
import { PLO_GUIDE, BLOOM } from "./obeGlossary";

const adb = prisma as unknown as Record<string, any>;

/** Is the OBE Assistant on for this institute, which key/model to use, and the daily limit. */
export async function assistantConfig(chairmanId: string) {
  const c = (await adb.aiConfig.findUnique({ where: { chairmanId } }).catch(() => null)) as { enabled: boolean; apiKey: string | null; model: string; chatbotEnabled?: boolean; chatbotDailyLimit?: number } | null;
  if (!c?.chatbotEnabled) return null;
  const key = c.enabled && c.apiKey ? { apiKey: c.apiKey, model: c.model } : process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" } : null;
  if (!key) return null;
  return { ...key, limit: c.chatbotDailyLimit ?? 20 };
}

export async function usedToday(userId: string) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return (await adb.obeChatLog.count({ where: { userId, at: { gte: start } } }).catch(() => 0)) as number;
}

/** What the assistant is told about the course — its plan only, never student names. */
export async function courseContext(courseId: string) {
  const chain = await courseChain(courseId);
  if (!chain) return "";
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, creditHours: true, semesterNumber: true, courseType: true, batchId: true, catalogDescription: true } });
  const [plos, topics] = await Promise.all([
    course?.batchId ? prisma.pLO.findMany({ where: { batchId: course.batchId }, orderBy: { number: "asc" }, select: { number: true, title: true, description: true } }) : Promise.resolve([]),
    prisma.lectureRow.findMany({ where: { courseId, source: chain.source }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, cloId: true } }),
  ]);
  const cloCode = new Map(chain.clos.map((c) => [c.id, c.code]));
  return [
    `COURSE: ${course?.code} ${course?.title} (${course?.creditHours} credit hours, semester ${course?.semesterNumber ?? "?"}, ${course?.courseType}).`,
    course?.catalogDescription ? `Description: ${course.catalogDescription.slice(0, 800)}` : "",
    `PROGRAM PLOs:\n${plos.map((p) => `PLO-${p.number} ${p.title}: ${p.description}`).join("\n")}`,
    `CLOs:\n${chain.clos.map((c) => `${c.code} (${c.bloom}) → ${c.ploNumber ? `PLO-${c.ploNumber}` : "no PLO"}: ${c.statement}${c.attainment != null ? ` [attainment ${c.attainment}% of students, target ${c.target}%]` : ""}`).join("\n")}`,
    `LECTURE TOPICS:\n${topics.map((t) => `L${t.lectureNumber} ${t.topic}${t.cloId ? ` [${cloCode.get(t.cloId) || ""}]` : ""}`).join("\n").slice(0, 3500)}`,
    `ASSESSMENTS:\n${chain.assessments.map((a) => `${a.label} (${a.type}, ${a.marksPct}% of course) → ${a.cloId ? cloCode.get(a.cloId) : "no CLO"}${a.avg != null ? `, class average ${a.avg}%` : ""}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
}

export const SYSTEM_PROMPT = `You are the OBE Assistant inside a university's Outcome-Based Education app, helping faculty (Subject Experts and Instructors) understand and improve their course's CLOs, PLO mapping, Bloom levels, topics and assessments.
Rules: be concise and practical (short paragraphs or bullets). Explain WHY a CLO fits a PLO using the CLO's verb, its Bloom level and the PLO's meaning. When you suggest a rewrite, give the exact new CLO text. You only suggest — the OMC approves changes to PLO mappings (faculty can use "Request PLO change" in the app). Never invent marks or results; use only the data given. If something is outside OBE/curriculum, say so briefly.
Reference — standard computing PLOs: ${PLO_GUIDE.map((p) => `PLO-${p.n} ${p.title}: ${p.meaning} (${p.notThis})`).join(" ")}
Bloom: ${BLOOM.map((b) => `${b.level} ${b.name} (${b.verbs.join(", ")})`).join("; ")}.`;

export async function askClaude(cfg: { apiKey: string; model: string }, system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 900, system, messages }),
  });
  if (!res.ok) throw new Error(`The AI service returned an error (${res.status}).`);
  const d = await res.json();
  return (d.content || []).map((c: { text?: string }) => c.text || "").join("").trim();
}
