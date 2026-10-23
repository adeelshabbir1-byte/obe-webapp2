import { rdb, type Who } from "./registers";

// Every policy, manual and curriculum of the institute, each version with its approval trail: the Board of Studies
// meeting and minute, the Academic Council meeting and minute, and the date it takes effect. The trail is printed
// into the SAR (lib/sarBuilder.ts).

export const POL_HINT = "Policy version history needs prisma/migration_policy_history.sql — run it in Supabase.";
export const KINDS: Record<string, string> = { POLICY: "Policy", MANUAL: "Manual / handbook", CURRICULUM: "Curriculum / scheme of studies", SOP: "Procedure (SOP)" };
export type Doc = { id: string; chairmanId: string; kind: string; title: string; program: string | null };
export type Version = { id: string; docId: string; version: string; summary: string | null; bosMeeting: string | null; bosDate: Date | null; bosMinute: string | null; acMeeting: string | null; acDate: Date | null; acMinute: string | null; effectiveFrom: Date | null; link: string | null; fileName: string | null; createdAt: Date };
export const canEditPolicies = (w: Who) => w.leader || w.qec || w.lead;
const sel = { id: true, docId: true, version: true, summary: true, bosMeeting: true, bosDate: true, bosMinute: true, acMeeting: true, acDate: true, acMinute: true, effectiveFrom: true, link: true, fileName: true, createdAt: true };

export async function docsWithVersions(chairmanId: string, program?: string | null) {
  try {
    const docs = (await rdb.policyDoc.findMany({ where: { chairmanId, ...(program ? { OR: [{ program }, { program: null }] } : {}) }, orderBy: [{ kind: "asc" }, { title: "asc" }] })) as Doc[];
    const versions = (await rdb.policyVersion.findMany({ where: { docId: { in: docs.map((d) => d.id).concat(["none"]) } }, select: sel, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] })) as Version[];
    return docs.map((d) => { const vs = versions.filter((v) => v.docId === d.id); return { ...d, versions: vs, current: vs.find((v) => !v.effectiveFrom || new Date(v.effectiveFrom) <= new Date()) || vs[0] || null }; });
  } catch { return null; }
}
/** Gaps in a version's trail (what the SAR reviewer will ask for). */
export function trailGaps(v: Version) {
  const g: string[] = [];
  if (!v.bosMeeting && !v.bosMinute) g.push("Board of Studies meeting / minute");
  if (!v.acMeeting && !v.acMinute) g.push("Academic Council meeting / minute");
  if (!v.effectiveFrom) g.push("effective date");
  if (!v.fileName && !v.link) g.push("the approved document");
  return g;
}
export const trailText = (v: Version) => [v.bosMeeting || v.bosMinute ? `BoS ${[v.bosMeeting, v.bosMinute ? `minute ${v.bosMinute}` : ""].filter(Boolean).join(", ")}${v.bosDate ? ` (${new Date(v.bosDate).toLocaleDateString("en-GB")})` : ""}` : "", v.acMeeting || v.acMinute ? `Academic Council ${[v.acMeeting, v.acMinute ? `minute ${v.acMinute}` : ""].filter(Boolean).join(", ")}${v.acDate ? ` (${new Date(v.acDate).toLocaleDateString("en-GB")})` : ""}` : ""].filter(Boolean).join("; ") || "—";
