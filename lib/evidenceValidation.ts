import { prisma } from "./db";

// Traces a course up to its owning Chairman: Course -> Batch ->
// Coordinator -> managedBy -> Chairman. Used to look up that
// institution's own AI configuration rather than the platform default.
async function findChairmanIdForCourse(courseId: string): Promise<string | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { batch: { include: { coordinator: true } } },
  });
  const coordinator = course?.batch?.coordinator;
  if (!coordinator) return null;
  if (coordinator.role === "CHAIRMAN") return coordinator.id;
  // walk up managedBy until we hit a CHAIRMAN (coordinator is typically managed directly by one, but this is defensive against deeper chains)
  let current = coordinator;
  for (let i = 0; i < 5 && current.managedById; i++) {
    const next = await prisma.user.findUnique({ where: { id: current.managedById } });
    if (!next) break;
    if (next.role === "CHAIRMAN") return next.id;
    current = next;
  }
  return null;
}

// Resolves which API key/model to use for a given course: that
// institution's own AiConfig if they've set one up and enabled it,
// otherwise the platform-wide ANTHROPIC_API_KEY env var. Returns null
// if neither is available (falls back to the deterministic check).
async function resolveAiCredentials(courseId: string): Promise<{ apiKey: string; model: string } | null> {
  const chairmanId = await findChairmanIdForCourse(courseId);
  if (chairmanId) {
    const config = await prisma.aiConfig.findUnique({ where: { chairmanId } });
    if (config?.enabled && config.apiKey) {
      return { apiKey: config.apiKey, model: config.model };
    }
  }
  const platformKey = process.env.ANTHROPIC_API_KEY;
  if (platformKey) return { apiKey: platformKey, model: "claude-sonnet-4-6" };
  return null;
}

// Uploads a file buffer to Supabase Storage via its REST API directly
// (no SDK dependency). Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY to already be set as env vars — the same
// Supabase project already used for the database, just its Storage
// feature. The bucket must exist first (see setup notes shared
// alongside this feature) and be public, or callers must use the
// returned path with a signed URL instead.
export async function uploadEvidenceFile(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to upload evidence files");
  }
  const bucket = "instrument-evidence";
  const path = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": contentType, "x-upsert": "false" },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed (${res.status}): ${text}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

// Every CLO that an instrument is meant to assess, via
// LectureRowInstrument -> LectureRow -> CLO.
async function getCoveredClos(instrumentId: string) {
  const links = await prisma.lectureRowInstrument.findMany({
    where: { instrumentId },
    include: { lectureRow: { include: { clo: true } } },
  });
  const seen = new Set<string>();
  const clos: { id: string; statement: string }[] = [];
  for (const link of links) {
    const clo = link.lectureRow.clo;
    if (clo && !seen.has(clo.id)) {
      seen.add(clo.id);
      clos.push({ id: clo.id, statement: clo.statement });
    }
  }
  return clos;
}

// Runs the AI check (if ANTHROPIC_API_KEY is configured) or the
// deterministic fallback, and writes the result onto the
// InstrumentEvidence row. Never throws in a way that blocks the
// upload itself — a failed AI call falls back to the deterministic
// path rather than leaving the evidence unreviewed.
export async function validateEvidence(evidenceId: string, fileBuffer: Buffer, contentType: string) {
  const evidence = await prisma.instrumentEvidence.findUnique({ where: { id: evidenceId } });
  if (!evidence) return;

  const clos = await getCoveredClos(evidence.instrumentId);
  const cloIdsJson = JSON.stringify(clos.map((c) => c.id));

  if (clos.length === 0) {
    await prisma.instrumentEvidence.update({
      where: { id: evidenceId },
      data: { status: "FLAGGED", method: "DETERMINISTIC", reasoning: "This instrument isn't linked to any CLO yet (via its lecture rows), so there's nothing to check the evidence against. Link it to a lecture row first.", checkedCloIds: cloIdsJson, validatedAt: new Date() },
    });
    return;
  }

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: evidence.instrumentId } });
  const aiCreds = instrument ? await resolveAiCredentials(instrument.courseId) : null;
  if (aiCreds && (contentType === "application/pdf" || contentType.startsWith("image/"))) {
    try {
      const result = await runAiCheck(aiCreds.apiKey, aiCreds.model, fileBuffer, contentType, clos);
      await prisma.instrumentEvidence.update({
        where: { id: evidenceId },
        data: { status: result.verdict, method: "AI", reasoning: result.reasoning, checkedCloIds: cloIdsJson, validatedAt: new Date() },
      });
      return;
    } catch (err) {
      // Fall through to the deterministic path below rather than leaving this unreviewed.
    }
  }

  await prisma.instrumentEvidence.update({
    where: { id: evidenceId },
    data: {
      status: "FLAGGED", method: "DETERMINISTIC",
      reasoning: aiCreds
        ? "The AI check couldn't run for this file (only PDF and image evidence are AI-checked currently, or the check itself failed) — please review manually."
        : "No AI model is configured for this institution or the platform (set one up under AI Configuration), so this evidence hasn't been automatically checked against its CLOs. The upload itself succeeded — please review it manually.",
      checkedCloIds: cloIdsJson, validatedAt: new Date(),
    },
  });
}

async function runAiCheck(apiKeyStr: string, modelStr: string, fileBuffer: Buffer, contentType: string, clos: { id: string; statement: string }[]): Promise<{ verdict: string; reasoning: string }> {
  const base64 = fileBuffer.toString("base64");
  const isImage = contentType.startsWith("image/");
  const cloList = clos.map((c, i) => `${i + 1}. ${c.statement}`).join("\n");

  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: contentType, data: base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

  const prompt = `You are reviewing an assessment artifact (a rubric, exam paper, or project brief) to check whether it genuinely measures the following Course Learning Outcomes:\n\n${cloList}\n\nRespond with ONLY a JSON object, no other text: {"verdict": "VALIDATED" or "FLAGGED", "reasoning": "one or two sentences explaining your judgment"}. Use VALIDATED only if the artifact plausibly assesses these outcomes; use FLAGGED if it seems unrelated, too shallow, or you're genuinely unsure.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelStr,
      max_tokens: 500,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((b: any) => b.text || "").join("");
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const verdict = parsed.verdict === "VALIDATED" ? "VALIDATED" : "FLAGGED";
  return { verdict, reasoning: String(parsed.reasoning || "").slice(0, 2000) };
}
