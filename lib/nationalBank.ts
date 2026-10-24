import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

export const nbdb = prisma as unknown as Record<string, any>;
export const HEC_GREEN = "#1E7B3C";
export const FRAMEWORKS = ["HEC", "NCEAC", "NBEAC", "PEC"];

/** Each university gets its own steady colour (never green, which is the national bank's), so its flavour of a framework is recognisable. */
export function instituteColor(name: string | null | undefined) {
  let h = 0; for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  let hue = h % 300; if (hue >= 80) hue += 80; // skip 80–160 (greens)
  return `hsl(${hue % 360} 55% 42%)`;
}

/** Is this person part of the national authority (HEC): its head, or anyone in its institute? Returns the authority's id. */
export async function nationalMember(user: { id: string; role: string; managedById: string | null }) {
  // A national curriculum team member (National Subject Expert) sits on the National Releases committee of their area.
  if (await (await import("./platformTeam")).teamScope(user.id)) {
    const a = (await nbdb.nationalAuthority.findFirst({}).catch(() => null)) as { chairmanId: string; name: string } | null;
    if (a) return a;
  }
  const cid = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  if (!cid) return null;
  const a = (await nbdb.nationalAuthority.findUnique({ where: { chairmanId: cid } }).catch(() => null)) as { chairmanId: string; name: string } | null;
  return a;
}

/** Credit, like citations: per contributor and per institute, how many times their shared courses were imported and by how many universities. */
export async function creditBoard() {
  const pcs = await prisma.publicCourse.findMany({ where: { status: "PUBLIC" }, select: { id: true, authorId: true, instituteName: true, importCount: true, author: { select: { name: true } } } });
  const imps = await prisma.publicCourseImport.findMany({ where: { publicCourseId: { in: pcs.map((p) => p.id) } }, select: { publicCourseId: true, importedById: true } });
  const importers = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(imps.map((i) => i.importedById))) } }, select: { id: true, role: true, managedById: true } });
  const instOf = new Map<string, string>();
  for (const u of importers) instOf.set(u.id, await chairmanIdFor(u).catch(() => ""));
  const nat = (await nbdb.nationalReleaseCourse.findMany({ where: { publicCourseId: { in: pcs.map((p) => p.id) } }, select: { publicCourseId: true } }).catch(() => [])) as { publicCourseId: string }[];
  const inNational = new Set(nat.map((n) => n.publicCourseId));
  const people = new Map<string, { name: string; institute: string; courses: number; imports: number; universities: Set<string>; national: number }>();
  const insts = new Map<string, { courses: number; imports: number; universities: Set<string>; national: number }>();
  for (const p of pcs) {
    const unis = new Set(imps.filter((i) => i.publicCourseId === p.id).map((i) => instOf.get(i.importedById) || "").filter(Boolean));
    const a = people.get(p.authorId) || { name: p.author.name, institute: p.instituteName || "—", courses: 0, imports: 0, universities: new Set<string>(), national: 0 };
    a.courses++; a.imports += p.importCount; unis.forEach((u) => a.universities.add(u)); if (inNational.has(p.id)) a.national++; people.set(p.authorId, a);
    const k = p.instituteName || "—"; const b = insts.get(k) || { courses: 0, imports: 0, universities: new Set<string>(), national: 0 };
    b.courses++; b.imports += p.importCount; unis.forEach((u) => b.universities.add(u)); if (inNational.has(p.id)) b.national++; insts.set(k, b);
  }
  return {
    people: Array.from(people.entries()).map(([id, v]) => ({ id, ...v, universities: v.universities.size })).sort((a, b) => b.imports - a.imports || b.courses - a.courses),
    institutes: Array.from(insts.entries()).map(([name, v]) => ({ name, ...v, universities: v.universities.size })).sort((a, b) => b.imports - a.imports || b.courses - a.courses),
  };
}
