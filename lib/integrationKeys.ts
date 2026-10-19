import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";

// API keys an institute gives its own campus management system, so students, offered-course enrolments and marks flow
// in automatically instead of by Excel. Only a hash of the key is kept; the key is shown once.
const kdb = prisma as unknown as Record<string, any>;
const hash = (k: string) => createHash("sha256").update(k).digest("hex");

export async function createKey(chairmanId: string, label: string) {
  const key = `obe_${randomBytes(24).toString("base64url")}`;
  await kdb.instituteApiKey.create({ data: { id: randomUUID(), chairmanId, label, keyHash: hash(key), createdAt: new Date() } });
  return key;
}
export async function keysOf(chairmanId: string) {
  try { return (await kdb.instituteApiKey.findMany({ where: { chairmanId, revokedAt: null }, orderBy: { createdAt: "desc" } })) as { id: string; label: string; createdAt: Date; lastUsedAt: Date | null }[]; } catch { return null; }
}
export async function revokeKey(chairmanId: string, id: string) { await kdb.instituteApiKey.updateMany({ where: { id, chairmanId }, data: { revokedAt: new Date() } }); }
/** The institute (Institute Head id) of a request's "Authorization: Bearer obe_..." key. */
export async function chairmanOfKey(auth: string | null): Promise<string | null> {
  const m = /^Bearer\s+(obe_[A-Za-z0-9_-]+)$/.exec(auth || "");
  if (!m) return null;
  try {
    const row = await kdb.instituteApiKey.findFirst({ where: { keyHash: hash(m[1]), revokedAt: null } });
    if (!row) return null;
    await kdb.instituteApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return row.chairmanId;
  } catch { return null; }
}
