import { randomUUID } from "crypto";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { departmentsOf } from "./fyp";
import { COUNCIL_SETS, type CouncilKey } from "./councilAttributes";

// Which council attribute(s) each of a batch's own Graduate Attributes stands for (EGA / CGA / BGA), the coverage check,
// and loading a council's whole set as the batch's GAs in one click.

const gdb = prisma as unknown as Record<string, any>;
export const GA_MAP_HINT = "The GA → council attribute map needs prisma/migration_council_tools.sql — run it in Supabase.";
export const GA_MAP_EDITORS = ["PROGRAM_COORDINATOR", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "OMC"];
const normT = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");

type Who = { id: string; role: string; managedById: string | null };

/** Batches this person may see on the map page. */
export async function mapBatches(user: Who) {
  const sel = { id: true, batchName: true, degreeProgram: true, coordinatorId: true } as const;
  if (user.role === "PROGRAM_COORDINATOR") return prisma.batch.findMany({ where: { coordinatorId: user.id }, select: sel, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const chairmanId = await chairmanIdFor(user);
  const leadWhere: Record<string, unknown> = { role: "PROGRAM_COORDINATOR", managedById: chairmanId };
  if (user.role !== "CHAIRMAN") leadWhere.departmentId = { in: (await departmentsOf(user.id)).concat(["none"]) };
  const leads = await prisma.user.findMany({ where: leadWhere, select: { id: true } });
  return prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) } }, select: sel, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
}

export async function loadMap(batchId: string, body: CouncilKey): Promise<Map<string, number[]>> {
  try {
    const rows = (await gdb.gaCouncilMap.findMany({ where: { batchId, body } })) as { ploId: string; attrsJson: string }[];
    return new Map(rows.map((r) => [r.ploId, (() => { try { return (JSON.parse(r.attrsJson) as number[]).filter((n) => Number.isInteger(n)); } catch { return []; } })()]));
  } catch { return new Map(); }
}

export async function saveMap(batchId: string, ploId: string, body: CouncilKey, attrs: number[], by: string) {
  const valid = new Set(COUNCIL_SETS[body].attrs.map((a) => a.n));
  const clean = Array.from(new Set(attrs.filter((n) => valid.has(n)))).sort((a, b) => a - b);
  await gdb.gaCouncilMap.upsert({
    where: { ploId_body: { ploId, body } },
    create: { id: randomUUID(), batchId, ploId, body, attrsJson: JSON.stringify(clean), updatedById: by, updatedAt: new Date() },
    update: { attrsJson: JSON.stringify(clean), updatedById: by, updatedAt: new Date() },
  });
}

/** Map GAs whose title matches a council attribute's title, where not mapped yet. */
export async function autoMap(batchId: string, body: CouncilKey, by: string) {
  const [plos, map] = await Promise.all([prisma.pLO.findMany({ where: { batchId }, select: { id: true, title: true } }), loadMap(batchId, body)]);
  let n = 0;
  for (const p of plos) {
    if (map.get(p.id)?.length) continue;
    const a = COUNCIL_SETS[body].attrs.find((x) => normT(x.title) === normT(p.title));
    if (a) { await saveMap(batchId, p.id, body, [a.n], by); n++; }
  }
  return n;
}

/** Add the council's attributes the batch doesn't have yet (matched by title) as its GAs, each mapped to its attribute. */
export async function loadSet(batchId: string, body: CouncilKey, by: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true } });
  if (!batch) throw new Error("No such batch.");
  const plos = await prisma.pLO.findMany({ where: { batchId }, select: { number: true, title: true } });
  const have = new Set(plos.map((p) => normT(p.title)));
  const used = new Set(plos.map((p) => p.number));
  const set = COUNCIL_SETS[body];
  let created = 0;
  for (const a of set.attrs) {
    if (have.has(normT(a.title))) continue;
    let num = a.n; while (used.has(num)) num++;
    used.add(num);
    const p = await prisma.pLO.create({ data: { coordinatorId: batch.coordinatorId, batchId, number: num, title: a.title, description: a.statement } });
    created++;
    try { await saveMap(batchId, p.id, body, [a.n], by); } catch { /* map table not there yet: GAs still created */ }
  }
  const mapped = await autoMap(batchId, body, by).catch(() => 0);
  return { created, mapped };
}
