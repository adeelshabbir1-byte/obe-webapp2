import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";
import { saveSetting } from "./scopedSettings";
import { writeAuditLog } from "./audit";
import { gaAverages } from "./skillsTranscriptCore";

// HEC national view (queue item 8.1–8.2): a read-only page for HEC across the universities on OBEHUB that chose to share
// their totals. Totals only — never a student's or teacher's name. Reached by a private, expiring link the platform
// team makes (no HEC account in OBEHUB). Also: which universities adopted each national curriculum, and who is behind.
const db = prisma as unknown as Record<string, any>;
export const HEC_HINT = "Run prisma/migration_adeel_p11.sql in Supabase first.";
const SHARE = "hec.share";
const hashOf = (t: string) => createHash("sha256").update(t).digest("hex");

export async function sharing(chairmanId: string) {
  const r = await db.scopedSetting?.findFirst({ where: { chairmanId, scopeType: "INSTITUTE", scopeId: chairmanId, key: SHARE } }).catch(() => null);
  return r?.value === "1";
}
export async function setSharing(by: { id: string }, chairmanId: string, on: boolean) {
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, SHARE, on ? "1" : "0", by.id);
  await writeAuditLog({ actorUserId: by.id, action: on ? "HEC_SHARING_ON" : "HEC_SHARING_OFF", entityType: "Institute", entityId: chairmanId });
}

export async function makeLink(by: { id: string }, label: string, days: number) {
  if (!db.hecViewLink) throw new Error(HEC_HINT);
  const token = randomBytes(24).toString("base64url");
  await db.hecViewLink.create({ data: { id: randomUUID(), label: label.slice(0, 120) || "HEC", tokenHash: hashOf(token), expiresAt: new Date(Date.now() + Math.max(1, Math.min(365, days || 30)) * 864e5), createdById: by.id } });
  await writeAuditLog({ actorUserId: by.id, action: "HEC_VIEW_LINK_CREATED", entityType: "HecViewLink", metadata: { label, days } });
  return token;
}
export async function links() { return ((await db.hecViewLink?.findMany({ orderBy: { createdAt: "desc" }, take: 50 }).catch(() => [])) || []) as { id: string; label: string; expiresAt: Date; revokedAt: Date | null; lastSeen: Date | null; createdAt: Date }[]; }
export async function revoke(id: string) { await db.hecViewLink?.update({ where: { id }, data: { revokedAt: new Date() } }).catch(() => null); }
export async function linkOf(token: string) {
  if (!token || token.length < 20 || !db.hecViewLink) return null;
  const l = await db.hecViewLink.findUnique({ where: { tokenHash: hashOf(token) } }).catch(() => null);
  if (!l || l.revokedAt || new Date(l.expiresAt) < new Date()) return null;
  await db.hecViewLink.update({ where: { id: l.id }, data: { lastSeen: new Date() } }).catch(() => null);
  return l as { id: string; label: string; expiresAt: Date };
}

/** The totals of every institute that shares, plus the platform-wide counts of those that do not (numbers only). */
export async function national() {
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" as never, isActive: true }, select: { id: true, name: true, instituteName: true } as never }) as unknown as { id: string; name: string; instituteName: string | null }[];
  const shareRows = ((await db.scopedSetting?.findMany({ where: { key: SHARE, value: "1", scopeType: "INSTITUTE" } }).catch(() => [])) || []) as { chairmanId: string }[];
  const shared = new Set(shareRows.map((r) => r.chairmanId));
  const demo = new Set((((await db.demoFlag?.findMany({ select: { chairmanId: true } }).catch(() => [])) || []) as { chairmanId: string }[]).map((d) => d.chairmanId));
  const inst = [];
  for (const h of heads.filter((x) => shared.has(x.id))) {
    const leads = (await prisma.user.findMany({ where: { managedById: h.id, role: "PROGRAM_COORDINATOR" as never }, select: { id: true } })).map((l) => l.id);
    const [batches, students, offered, closTotal, closMapped, cqi, cqiOk, recs] = await Promise.all([
      prisma.batch.findMany({ where: { coordinatorId: { in: leads.concat("none") } }, select: { degreeProgram: true, coordinatorId: true } }),
      prisma.student.count({ where: { batch: { coordinatorId: { in: leads.concat("none") } } } }),
      prisma.course.count({ where: { isOffered: true, coordinatorId: { in: leads.concat("none") } } }),
      prisma.cLO.count({ where: { source: "SE", course: { coordinatorId: { in: leads.concat("none") } } } }),
      prisma.cLO.count({ where: { source: "SE", mappedPloId: { not: null }, course: { coordinatorId: { in: leads.concat("none") } } } }),
      prisma.cqiRecord.count({ where: { chairmanId: h.id } }).catch(() => 0),
      prisma.cqiRecord.count({ where: { chairmanId: h.id, status: "verified-effective" } }).catch(() => 0),
      prisma.studentTranscriptRecord.findMany({ where: { coordinatorId: { in: leads.concat("none") } }, select: { coordinatorId: true, courseCode: true, ploAttainmentJson: true }, take: 20000 }),
    ]);
    const progOf = new Map<string, string>(); for (const b of batches) if (!progOf.has(b.coordinatorId)) progOf.set(b.coordinatorId, b.degreeProgram);
    const disc = new Map<string, { courseCode: string; ploAttainmentJson: string }[]>();
    for (const r of recs) { const p = progOf.get(r.coordinatorId) || "Other"; disc.set(p, [...(disc.get(p) || []), r]); }
    inst.push({
      id: h.id, name: h.instituteName || h.name, demo: demo.has(h.id), programs: Array.from(new Set(batches.map((b) => b.degreeProgram))).sort(), students, offered,
      cloMappedPct: closTotal ? Math.round((100 * closMapped) / closTotal) : null, cqi, cqiEffective: cqiOk,
      gaByProgram: Array.from(disc.entries()).map(([program, rs]) => ({ program, gas: gaAverages(rs).map((g) => ({ number: g.number, pct: g.pct })) })),
    });
  }
  return { institutes: inst, totalInstitutes: heads.length, sharing: inst.length };
}

/** National curricula and who adopted which version (adopters named only if they share). */
export async function adoption() {
  const official = ((await prisma.masterCurriculum.findMany({ where: { chairmanId: null }, select: { id: true, authority: true, title: true, version: true } }).catch(() => [])) || []) as { id: string; authority: string; title: string; version: string }[];
  const clones = ((await prisma.masterCurriculum.findMany({ where: { chairmanId: { not: null }, parentCurriculumId: { not: null } }, select: { chairmanId: true, parentCurriculumId: true } }).catch(() => [])) || []) as { chairmanId: string; parentCurriculumId: string }[];
  const shareRows = ((await db.scopedSetting?.findMany({ where: { key: SHARE, value: "1", scopeType: "INSTITUTE" } }).catch(() => [])) || []) as { chairmanId: string }[];
  const shared = new Set(shareRows.map((r) => r.chairmanId));
  const names = new Map(((await prisma.user.findMany({ where: { id: { in: clones.map((c) => c.chairmanId).concat("none") } }, select: { id: true, name: true, instituteName: true } as never })) as unknown as { id: string; name: string; instituteName: string | null }[]).map((u) => [u.id, u.instituteName || u.name]));
  const families = new Map<string, typeof official>();
  for (const o of official) { const k = `${o.authority}|${o.title}`; families.set(k, [...(families.get(k) || []), o]); }
  return Array.from(families.values()).map((vs) => {
    const sorted = vs.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    const latest = sorted[0];
    const byVersion = sorted.map((v) => { const who = Array.from(new Set(clones.filter((c) => c.parentCurriculumId === v.id).map((c) => c.chairmanId))); return { version: v.version, latest: v.id === latest.id, count: who.length, named: who.filter((w) => shared.has(w)).map((w) => names.get(w) || "") }; });
    return { authority: latest.authority, title: latest.title, latest: latest.version, versions: byVersion, behind: byVersion.filter((v) => !v.latest).reduce((a, v) => a + v.count, 0) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
