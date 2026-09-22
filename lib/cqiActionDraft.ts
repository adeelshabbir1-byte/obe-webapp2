import { prisma } from "./db";

// Resolves which API key/model to use for this institution's Chairman:
// their own AiConfig if set up and enabled, otherwise the platform-wide
// ANTHROPIC_API_KEY env var. Returns null if neither is available.
// Same resolution order as lib/evidenceValidation.ts, but keyed directly
// off chairmanId since a CQI record is already chairman-scoped — no
// need to walk up from a course.
async function resolveAiCredentials(chairmanId: string): Promise<{ apiKey: string; model: string } | null> {
  const config = await prisma.aiConfig.findUnique({ where: { chairmanId } });
  if (config?.enabled && config.apiKey) return { apiKey: config.apiKey, model: config.model };
  const platformKey = process.env.ANTHROPIC_API_KEY;
  if (platformKey) return { apiKey: platformKey, model: "claude-sonnet-4-6" };
  return null;
}

// Drafts a suggested "action taken" for a CQI finding — a starting
// point the Chairman/OMC reviews and edits before saving, never saved
// automatically. Returns null (rather than throwing) if no AI model is
// configured or the call fails, so the caller can show a clear message
// instead of a broken button.
export async function draftCqiAction(chairmanId: string, context: {
  finding: string; sourceType: string | null; sourceReference: string | null;
  courseLabel: string | null; batchLabel: string | null; metricBefore: number | null;
}): Promise<{ draft: string } | { error: string }> {
  const creds = await resolveAiCredentials(chairmanId);
  if (!creds) {
    return { error: "No AI model is configured for this institution or the platform (set one up under AI Configuration) — write the action manually instead." };
  }

  const contextLines = [
    context.sourceReference ? `Source: ${context.sourceType || "record"} ${context.sourceReference}` : null,
    context.courseLabel ? `Course: ${context.courseLabel}` : null,
    context.batchLabel ? `Batch: ${context.batchLabel}` : null,
    context.metricBefore !== null ? `Current metric: ${context.metricBefore}%` : null,
  ].filter(Boolean).join("\n");

  const prompt = `You are a Continuous Quality Improvement (CQI) assistant for a university's outcome-based education (OBE) program, working under NCEAC-style accreditation. Given a documented finding, draft a specific, actionable "action taken" statement addressing it.

${contextLines ? contextLines + "\n\n" : ""}Finding: ${context.finding}

Write ONE short paragraph (2-4 sentences) describing a concrete, plausible corrective or improvement action a Chairman or Quality Committee might take in response to this finding — specific enough to be useful (e.g. naming what would change in teaching, assessment, or curriculum), not generic filler like "we will monitor the situation." This is a DRAFT the person reviewing it will edit before saving, not a final decision, so do not claim the action has already been completed or verified effective.

Respond with ONLY the action statement text, no preamble, no quotation marks, no markdown.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": creds.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: creds.model, max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return { error: `The AI model returned an error (status ${res.status}) — write the action manually instead.` };
    const data = await res.json();
    const text = (data.content || []).map((b: any) => b.text || "").join("").trim();
    if (!text) return { error: "The AI model returned an empty response — write the action manually instead." };
    return { draft: text.slice(0, 2000) };
  } catch (err: any) {
    return { error: "Couldn't reach the AI model (" + (err?.message || "unknown error") + ") — write the action manually instead." };
  }
}
