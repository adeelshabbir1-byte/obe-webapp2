import { prisma } from "./db";
import { writeAuditLog } from "./audit";

// "Who changed this?" (Adeel prompt §3): saves record old → new values in the audit log (metadata.changes, JSON), and
// every record can show its history: who · when · what changed. Read-only.
export type Change = { field: string; from: unknown; to: unknown };
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v).slice(0, 160));

/** The fields that differ between two versions of a record. */
export function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null, fields: string[]): Change[] {
  return fields.filter((f) => show(before?.[f]) !== show(after?.[f])).map((f) => ({ field: f, from: before?.[f] ?? null, to: after?.[f] ?? null }));
}

/** Logs a change with its old and new values (nothing when nothing changed, unless it is a create / delete). */
export async function logChange(actorUserId: string, action: string, entityType: string, entityId: string, changes: Change[], always = false) {
  if (!changes.length && !always) return;
  await writeAuditLog({ actorUserId, action, entityType, entityId, metadata: { changes: JSON.stringify(changes.map((c) => ({ field: c.field, from: show(c.from), to: show(c.to) }))).slice(0, 8000) } }).catch(() => null);
}

export type HistoryRow = { at: Date; who: string; action: string; changes: { field: string; from: string; to: string }[] };
/** A record's history, newest first. */
export async function historyOf(entityType: string, entityId: string, take = 50): Promise<HistoryRow[]> {
  const rows = await prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "desc" }, take, select: { createdAt: true, action: true, metadata: true, actor: { select: { name: true } } } });
  return rows.map((r) => {
    let changes: HistoryRow["changes"] = [];
    try { const m = r.metadata as { changes?: string } | null; if (m?.changes) changes = JSON.parse(m.changes); } catch { changes = []; }
    return { at: r.createdAt, who: r.actor?.name || "System", action: r.action, changes };
  });
}
