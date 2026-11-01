import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getFlag, setFlag } from "./scopedSettings";

// Undo for 10 seconds (Adeel prompt §2). An action stores its inverse under a one-time token (UserFlag "undo:<token>")
// and returns { undoToken, undoLabel }; the shared toast (components/UndoToast.tsx) shows "Done · Undo" for 10 s.
// Inverse kinds:
//  - restore: put back these fields on these rows ({ model, id, data }[])
//  - recreate: create these rows again, exactly as they were ({ model, data }[]), children after parents
// Never used for actions that send something outside (emails, approvals already sent, published results).
const db = prisma as unknown as Record<string, any>;
export const UNDO_SECONDS = 10;
const GRACE = 5; // network delay
export type Inverse = { restore?: { model: string; id: string; data: Record<string, unknown> }[]; recreate?: { model: string; data: Record<string, unknown> }[]; after?: { kind: "syncCourse" | "renumberClos"; courseId: string }[] };

export async function offerUndo(userId: string, label: string, inverse: Inverse) {
  const token = randomUUID();
  await setFlag(userId, `undo:${token}`, JSON.stringify({ label, inverse, until: Date.now() + (UNDO_SECONDS + GRACE) * 1000 })).catch(() => null);
  return { undoToken: token, undoLabel: label };
}

export async function runUndo(userId: string, token: string) {
  const raw = await getFlag(userId, `undo:${token}`);
  if (!raw) return { error: "Nothing to undo." };
  await setFlag(userId, `undo:${token}`, null);
  const u = JSON.parse(raw) as { label: string; inverse: Inverse; until: number };
  if (Date.now() > u.until) return { error: "Too late to undo." };
  const dateish = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) ? new Date(v) : v]));
  for (const r of u.inverse.recreate || []) await db[r.model].create({ data: dateish(r.data) });
  for (const r of u.inverse.restore || []) await db[r.model].update({ where: { id: r.id }, data: dateish(r.data) });
  for (const a of u.inverse.after || []) {
    if (a.kind === "renumberClos") await (await import("./cloOrdering")).renumberClos(a.courseId, "SE").catch(() => null);
    if (a.kind === "syncCourse") await (await import("./contentSync")).syncCourseContentToLinkedCourses(a.courseId).catch(() => null);
  }
  return { ok: true, label: u.label };
}
