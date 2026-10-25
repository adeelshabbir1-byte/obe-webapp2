import { prisma } from "./db";
import { LIST_TYPES } from "./autoCopyPreviousBatch";

// The guided set-up of a batch: one ordered list of steps, each done on the page that already exists for it. Some steps
// tick themselves (courses imported, all synced, every course has an SE); the others are ticked by the Program Lead's
// "… are final" / "Save and continue" on that page. Progress is kept per batch (BatchSetupStep).

const db = prisma as unknown as Record<string, any>;
export type StepKey = "batch" | "source" | "tracks" | "import" | "sync" | "home" | "names" | "positions" | "prereqs" | "electives" | "ses" | "ga" | "review";
export const STEPS: { key: StepKey; label: string; href: (b: string) => string; manual: boolean; doneLabel?: string }[] = [
  { key: "batch", label: "Batch", href: () => "/coordinator/batches", manual: false },
  { key: "source", label: "Source", href: (b) => `/coordinator/batches/new?batchId=${b}`, manual: false },
  { key: "tracks", label: "Tracks", href: (b) => `/coordinator/batches/new?batchId=${b}`, manual: false },
  { key: "import", label: "Preview & import", href: (b) => `/coordinator/batches/new?batchId=${b}`, manual: false },
  { key: "sync", label: "Sync & equalise", href: (b) => `/omc/content-sync?setup=${b}`, manual: false },
  { key: "home", label: "Home departments", href: (b) => `/coordinator/courses?batchId=${b}&setup=${b}&step=home`, manual: true },
  { key: "names", label: "Names & codes", href: (b) => `/coordinator/courses?batchId=${b}&setup=${b}&step=names`, manual: true, doneLabel: "Names and codes are final" },
  { key: "positions", label: "Semester positions", href: (b) => `/omc/course-repositioning?batchId=${b}&setup=${b}`, manual: true, doneLabel: "Positions are final" },
  { key: "prereqs", label: "Prerequisites", href: (b) => `/coordinator/prerequisite-map?batchId=${b}&setup=${b}`, manual: true, doneLabel: "Prerequisites are final" },
  { key: "electives", label: "Electives / IDS", href: (b) => `/coordinator/courses?batchId=${b}&setup=${b}&step=electives`, manual: true, doneLabel: "Electives are chosen" },
  { key: "ses", label: "Subject Experts", href: (b) => `/coordinator/assign-subject-experts?batchId=${b}&setup=${b}`, manual: false },
  { key: "ga", label: "GA mapping check", href: (b) => `/coordinator/courses?batchId=${b}&setup=${b}&step=ga`, manual: true, doneLabel: "GA mapping checked" },
  { key: "review", label: "Review & send to OMC", href: (b) => `/coordinator/batches/review?batchId=${b}`, manual: false },
];

export async function setupProgress(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, batchName: true, degreeProgram: true, prerequisitesConfirmedAt: true } });
  if (!b) return null;
  const marks = ((await db.batchSetupStep.findMany({ where: { batchId } }).catch(() => [])) as { step: string; byName: string; at: Date }[]);
  const cs = await prisma.course.findMany({ where: { batchId, courseType: { notIn: LIST_TYPES } }, select: { id: true, subjectExpertId: true } });
  const { setupStatus } = await import("./batchSetup");
  const st = cs.length ? await setupStatus(batchId).catch(() => null) : null;
  const review = await db.batchReview.findUnique({ where: { batchId } }).catch(() => null);
  const done = new Map<StepKey, string>(marks.map((m) => [m.step as StepKey, `${m.byName}, ${new Date(m.at).toLocaleDateString("en-GB")}`]));
  done.set("batch", "created");
  if (cs.length) { done.set("source", "chosen"); done.set("tracks", "set"); done.set("import", "imported"); }
  if (st && st.open === 0 && cs.length) done.set("sync", st.fromCurriculum ? "all synced or new" : "copied from a batch");
  if (st && st.naming.length === 0 && cs.length && !done.has("names")) done.set("names", "nothing to decide");
  if (b.prerequisitesConfirmedAt && !done.has("prereqs")) done.set("prereqs", "confirmed");
  if (cs.length && cs.every((c) => c.subjectExpertId)) done.set("ses", "every course has an SE");
  if (review) done.set("review", review.status === "APPROVED" ? "approved by the OMC" : "sent to the OMC");
  const steps = STEPS.map((s, i) => ({ ...s, n: i + 1, done: done.has(s.key), note: done.get(s.key) || null, url: s.href(batchId) }));
  const current = steps.find((s) => !s.done) || steps[steps.length - 1];
  return { batch: b, steps, current, doneCount: steps.filter((s) => s.done).length, total: steps.length, review };
}

export async function markStep(batchId: string, step: StepKey, by: { id: string; name: string }, on = true) {
  if (!on) { await db.batchSetupStep.deleteMany({ where: { batchId, step } }); return; }
  await db.batchSetupStep.upsert({ where: { batchId_step: { batchId, step } }, create: { batchId, step, byId: by.id, byName: by.name }, update: { byId: by.id, byName: by.name, at: new Date() } });
}
