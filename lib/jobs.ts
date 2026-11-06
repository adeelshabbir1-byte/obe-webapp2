import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { prisma } from "./db";

// A small background job queue in the database. Slow work that the person does not need to wait for (sending email,
// SMS / WhatsApp and phone pushes, …) is queued; it runs right after the response (Vercel's waitUntil), and the
// daily cron (and /api/cron/jobs) picks up anything left or due for a retry. A failing job is retried with a growing
// wait, up to MAX_TRIES. Without the table (migration not run yet) work simply runs straight away, as before.

const db = prisma as unknown as Record<string, any>;
export const JOBS_HINT = "Run prisma/migration_background_jobs.sql in Supabase first.";
const MAX_TRIES = 5;
type Handler = (payload: any) => Promise<void>;
const handlers: Record<string, () => Promise<Handler>> = {
  // Email, SMS / WhatsApp and phone push for a notification already shown in the bell.
  "notify.deliver": async () => (await import("./notifications")).deliverNotification,
};

/** Queue a job; it starts as soon as the current response has been sent. Never throws. */
export async function enqueue(kind: string, payload: unknown, opts: { delaySec?: number } = {}) {
  const id = randomUUID();
  try {
    await db.backgroundJob.create({ data: { id, kind, payloadJson: JSON.stringify(payload ?? null), status: "QUEUED", runAfter: new Date(Date.now() + (opts.delaySec || 0) * 1000) } });
  } catch {
    // No queue table yet: do the work now (the old behaviour) rather than lose it.
    const h = handlers[kind]; if (h) await (await h())(payload).catch(() => null);
    return null;
  }
  if (!opts.delaySec) afterResponse(runJobs({ limit: 10, ids: [id] }));
  return id;
}

/** Keeps the serverless function alive until `p` settles, after the response is sent (Vercel); elsewhere just runs it. */
function afterResponse(p: Promise<unknown>) {
  const safe = p.catch(() => null);
  try { waitUntil(safe); } catch { /* not on Vercel: the Node server keeps running it anyway */ }
}

/** Run due jobs (or the given ones). Each job is claimed atomically, so two runners never do the same job. */
export async function runJobs(opts: { limit?: number; ids?: string[] } = {}) {
  let due: { id: string; kind: string; payloadJson: string; attempts: number }[] = [];
  try {
    due = await db.backgroundJob.findMany({ where: { status: "QUEUED", runAfter: { lte: new Date() }, ...(opts.ids ? { id: { in: opts.ids } } : {}) }, orderBy: { createdAt: "asc" }, take: opts.limit ?? 50, select: { id: true, kind: true, payloadJson: true, attempts: true } });
  } catch { return { ran: 0, failed: 0 }; }
  let ran = 0, failed = 0;
  for (const j of due) {
    const claimed = await db.backgroundJob.updateMany({ where: { id: j.id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } } }).catch(() => ({ count: 0 }));
    if (!claimed.count) continue;
    try {
      const h = handlers[j.kind];
      if (!h) throw new Error(`No handler for ${j.kind}`);
      await (await h())(JSON.parse(j.payloadJson));
      await db.backgroundJob.update({ where: { id: j.id }, data: { status: "DONE", doneAt: new Date(), lastError: null } });
      ran++;
    } catch (e) {
      const tries = j.attempts + 1;
      const last = tries >= MAX_TRIES;
      await db.backgroundJob.update({ where: { id: j.id }, data: { status: last ? "FAILED" : "QUEUED", lastError: String((e as Error)?.message || e).slice(0, 500), runAfter: new Date(Date.now() + 2 ** tries * 30_000) } }).catch(() => null);
      failed++;
    }
  }
  // Jobs stuck in RUNNING (their function was stopped) go back to the queue after 10 minutes.
  await db.backgroundJob.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 600_000) } }, data: { status: "QUEUED" } }).catch(() => null);
  return { ran, failed };
}
