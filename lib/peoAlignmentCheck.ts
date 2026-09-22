import { prisma } from "./db";

// Same credential resolution as lib/cqiActionDraft.ts — this
// institution's own AiConfig if set up and enabled, otherwise the
// platform-wide ANTHROPIC_API_KEY env var.
async function resolveAiCredentials(chairmanId: string): Promise<{ apiKey: string; model: string } | null> {
  const config = await prisma.aiConfig.findUnique({ where: { chairmanId } });
  if (config?.enabled && config.apiKey) return { apiKey: config.apiKey, model: config.model };
  const platformKey = process.env.ANTHROPIC_API_KEY;
  if (platformKey) return { apiKey: platformKey, model: "claude-sonnet-4-6" };
  return null;
}

export type PeoAlignmentResult = {
  peo: string;
  status: "STRONG" | "PARTIAL" | "GAP";
  supportingPloNumbers: number[];
  reasoning: string;
};

// Checks each PEO against the program's own PLOs and judges whether the
// PLOs, collectively, genuinely support it — an unsupported PEO is a
// real accreditation gap (there's no path from what students actually
// learn, term to term, to that longer-term objective). Not persisted:
// PEOs and PLOs are already stored in the DB, so re-running this fresh
// each time is cheap and never goes stale the way a file-based check
// (like DotAI evidence) would.
export async function checkPeoAlignment(chairmanId: string, peos: string[], plos: { number: number; title: string; description: string }[]): Promise<{ results: PeoAlignmentResult[] } | { error: string }> {
  if (peos.length === 0) return { error: "No PEOs are defined yet for this degree program — add some above first." };
  if (plos.length === 0) return { error: "No PLOs are defined yet for this batch — define them on the Program Learning Outcomes page first." };

  const creds = await resolveAiCredentials(chairmanId);
  if (!creds) {
    return { error: "No AI model is configured for this institution or the platform (set one up under AI Configuration)." };
  }

  const peoList = peos.map((p, i) => `PEO-${i + 1}: ${p}`).join("\n");
  const ploList = plos.map((p) => `PLO-${p.number} (${p.title}): ${p.description}`).join("\n");

  const prompt = `You are reviewing a university degree program's outcome structure for NCEAC-style accreditation. Program Educational Objectives (PEOs) describe what graduates should achieve in their careers a few years after graduation; Program Learning Outcomes (PLOs) describe what a graduate can do at the moment of graduation. A PEO should be plausibly supported by the cumulative effect of the program's PLOs — a PEO with no genuine connection to any PLO is a real gap, since there's no traceable path from what students actually learn to that longer-term objective.

PEOs:
${peoList}

PLOs:
${ploList}

For EACH PEO, judge whether the PLOs above, collectively, plausibly support it. Respond with ONLY a JSON array, no other text, one object per PEO in the same order given:
[{"peo": "<the exact PEO text>", "status": "STRONG" | "PARTIAL" | "GAP", "supportingPloNumbers": [<PLO numbers that genuinely support this PEO>], "reasoning": "one or two sentences explaining the judgment"}]

Use STRONG when multiple PLOs clearly and directly build toward the PEO, PARTIAL when the connection is real but thin or indirect, and GAP when no PLO plausibly supports it at all.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": creds.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: creds.model, max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return { error: `The AI model returned an error (status ${res.status}).` };
    const data = await res.json();
    const text = (data.content || []).map((b: any) => b.text || "").join("").trim();
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return { error: "The AI model's response wasn't in the expected format — try again." };
    const results: PeoAlignmentResult[] = parsed.map((r: any, i: number) => ({
      peo: typeof r.peo === "string" ? r.peo : peos[i] || "",
      status: ["STRONG", "PARTIAL", "GAP"].includes(r.status) ? r.status : "GAP",
      supportingPloNumbers: Array.isArray(r.supportingPloNumbers) ? r.supportingPloNumbers.filter((n: any) => typeof n === "number") : [],
      reasoning: String(r.reasoning || "").slice(0, 1000),
    }));
    return { results };
  } catch (err: any) {
    return { error: "Couldn't reach or parse the AI model's response (" + (err?.message || "unknown error") + ") — try again." };
  }
}
