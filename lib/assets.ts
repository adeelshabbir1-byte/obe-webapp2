import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { approverFor } from "./approvers";
import { writeAuditLog } from "./audit";

// Lab equipment and assets. Every item has an asset tag (printed as a QR label). Anyone in the lab can report a fault
// by scanning the label; the lab engineer logs the repair. Each year the lab is counted and signed off; once a lab's
// count has been signed off, its computers (installed, working, specifications) are taken from the register into
// LabInfo / LabComputerSpec — the figures the NCEAC readiness checks and the SAR use. Writing an item off needs the
// condemnation committee's finding and the Institute Head's approval.

export const adb = prisma as unknown as Record<string, any>;
export const ASSET_HINT = "Run prisma/migration_assets.sql in Supabase first.";
export const CATEGORIES: Record<string, string> = { COMPUTER: "Computer", PROJECTOR: "Projector / display", NETWORK: "Network equipment", LAB_EQUIPMENT: "Lab equipment", FURNITURE: "Furniture", OTHER: "Other" };
export const STATUS: Record<string, string> = { WORKING: "Working", FAULTY: "Faulty", UNDER_REPAIR: "Under repair", CONDEMNED: "Condemned" };
export type Asset = { id: string; chairmanId: string; labId: string | null; room: string | null; category: string; item: string; makeModel: string | null; serialNo: string | null; assetTag: string; processor: string | null; ramGb: number | null; storage: string | null; gpu: string | null; os: string | null; spec: string | null; purchaseDate: Date | null; cost: number | null; supplier: string | null; warrantyEnd: Date | null; custodianId: string | null; status: string; createdAt: Date; updatedAt: Date };
export type Fault = { id: string; chairmanId: string; assetId: string; description: string; reportedBy: string | null; reportedById: string | null; reportedAt: Date; status: string; stepsJson: string; cost: number | null; fixedAt: Date | null };

type U = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
/** Which labs a person sees and whether they may change the register. */
export async function assetScope(user: U): Promise<{ chairmanId: string; departmentIds: string[] | null; canEdit: boolean } | null> {
  const { chairmanIdFor } = await import("./reportScope");
  if (user.role === "CHAIRMAN") return { chairmanId: user.id, departmentIds: null, canEdit: true };
  const chairmanId = await chairmanIdFor({ id: user.id, role: user.role, managedById: user.managedById });
  if (!chairmanId) return null;
  if (user.role === "LAB_MANAGER" || user.role === "FACILITIES_MANAGER") return { chairmanId, departmentIds: user.role === "LAB_MANAGER" && user.departmentId ? [user.departmentId] : null, canEdit: true };
  if (user.role === "LAB_ENGINEER") {
    // A lab engineer with a department looks after its labs; one without (onboarded under a Program Lead) looks after every lab.
    return { chairmanId, departmentIds: user.departmentId ? [user.departmentId] : null, canEdit: true };
  }
  const { labScope } = await import("./resources");
  const s = await labScope(user);
  return s ? { chairmanId: s.chairmanId, departmentIds: s.departmentIds, canEdit: false } : null;
}
export async function labsIn(chairmanId: string, departmentIds: string[] | null) {
  return prisma.labInfo.findMany({ where: { chairmanId, ...(departmentIds ? { departmentId: { in: departmentIds.concat(["none"]) } } : {}) }, select: { id: true, name: true, departmentId: true, seats: true, computers: true, computersWorking: true }, orderBy: { name: "asc" } });
}

/** The next free tag, e.g. DU-LAB1-0007. */
export async function nextTag(chairmanId: string, prefix: string) {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16) || "AST";
  const n = await adb.asset.count({ where: { chairmanId, assetTag: { startsWith: `${p}-` } } });
  for (let i = n + 1; i < n + 500; i++) { const t = `${p}-${String(i).padStart(4, "0")}`; if (!(await adb.asset.count({ where: { chairmanId, assetTag: t } }))) return t; }
  return `${p}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

/** Report a fault (from the QR on the machine — signed in or not). The custodian and the lab people are told. */
export async function reportFault(assetId: string, description: string, who: { id?: string | null; name: string }) {
  const a = (await adb.asset.findUnique({ where: { id: assetId } })) as Asset | null;
  if (!a || a.status === "CONDEMNED") throw new Error("This item is not in the register.");
  if (await adb.assetFault.count({ where: { assetId, status: { in: ["OPEN", "REPAIRING"] }, reportedAt: { gte: new Date(Date.now() - 6 * 3600_000) } } })) throw new Error("A fault on this item was reported in the last few hours — the lab engineer has been told.");
  const id = randomUUID();
  await adb.assetFault.create({ data: { id, chairmanId: a.chairmanId, assetId, description: description.slice(0, 1000), reportedBy: who.name.slice(0, 120) || null, reportedById: who.id || null } });
  if (a.status === "WORKING") await adb.asset.update({ where: { id: a.id }, data: { status: "FAULTY", updatedAt: new Date() } });
  const labPeople = (await prisma.user.findMany({ where: { isActive: true, role: { in: ["LAB_MANAGER", "LAB_ENGINEER"] }, OR: [{ managedById: a.chairmanId }, { managedBy: { managedById: a.chairmanId } }] }, select: { id: true } })).map((u) => u.id);
  await notifyUsers([a.custodianId, ...(a.custodianId ? [] : labPeople)], { kind: "ASSET_FAULT", title: `Fault reported: ${a.item} (${a.assetTag})`, body: description.slice(0, 200), href: `/assets?tab=faults` });
  await syncLab(a.labId);
  return id;
}

/** The repair log: a step (and when fixed, the cost). Fixing sets the item working again. */
export async function repairStep(faultId: string, by: { id: string; name: string }, o: { text: string; status: string; cost: number | null }) {
  const f = (await adb.assetFault.findUnique({ where: { id: faultId } })) as Fault | null;
  if (!f) throw new Error("Not found.");
  const steps = (JSON.parse(f.stepsJson || "[]") as { at: string; by: string; text: string }[]).concat(o.text ? [{ at: new Date().toISOString(), by: by.name, text: o.text.slice(0, 500) }] : []);
  const status = ["OPEN", "REPAIRING", "FIXED"].includes(o.status) ? o.status : f.status;
  await adb.assetFault.update({ where: { id: f.id }, data: { stepsJson: JSON.stringify(steps), status, cost: o.cost ?? f.cost, fixedAt: status === "FIXED" ? new Date() : null } });
  const a = (await adb.asset.findUnique({ where: { id: f.assetId } })) as Asset;
  const others = await adb.assetFault.count({ where: { assetId: f.assetId, id: { not: f.id }, status: { in: ["OPEN", "REPAIRING"] } } });
  await adb.asset.update({ where: { id: a.id }, data: { status: status === "FIXED" ? (others ? "FAULTY" : "WORKING") : status === "REPAIRING" ? "UNDER_REPAIR" : "FAULTY", updatedAt: new Date() } });
  await syncLab(a.labId);
}

/** Ask to write an item off: the committee's finding goes to the Institute Head (or whoever acts for them). */
export async function requestCondemnation(by: { id: string; name: string }, assetId: string, reason: string, committeeNote: string) {
  const a = (await adb.asset.findUnique({ where: { id: assetId } })) as Asset | null;
  if (!a || a.status === "CONDEMNED") throw new Error("Not found.");
  if (await adb.assetCondemnation.count({ where: { assetId, status: "PENDING" } })) throw new Error("Already waiting for approval.");
  await adb.assetCondemnation.create({ data: { id: randomUUID(), chairmanId: a.chairmanId, assetId, reason: reason.slice(0, 1000), committeeNote: committeeNote.slice(0, 1000) || null, requestedById: by.id } });
  const head = await approverFor(a.chairmanId, "INSTITUTE_HEAD");
  await notifyUsers(head.ids, { kind: "REQUEST", title: `Write off ${a.item} (${a.assetTag})?`, body: reason.slice(0, 200), href: "/approvals" });
}
export async function decideCondemnation(by: { id: string }, id: string, approve: boolean, note: string) {
  const c = await adb.assetCondemnation.findUnique({ where: { id } });
  if (!c || c.status !== "PENDING") throw new Error("This request is not waiting for a decision.");
  if (!(await approverFor(c.chairmanId, "INSTITUTE_HEAD")).ids.includes(by.id)) throw new Error("Only the Institute Head (or whoever acts for them) approves a write-off.");
  if (!approve && note.trim().length < 3) throw new Error("Say why it is not approved.");
  await adb.assetCondemnation.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: by.id, decidedAt: new Date(), decisionNote: note.slice(0, 500) || null } });
  const a = (await adb.asset.findUnique({ where: { id: c.assetId } })) as Asset;
  if (approve) { await adb.asset.update({ where: { id: a.id }, data: { status: "CONDEMNED", updatedAt: new Date() } }); await adb.assetFault.updateMany({ where: { assetId: a.id, status: { in: ["OPEN", "REPAIRING"] } }, data: { status: "CONDEMNED" } }); }
  await writeAuditLog({ actorUserId: by.id, action: approve ? "ASSET_CONDEMNED" : "ASSET_CONDEMNATION_REJECTED", entityType: "Asset", entityId: a.id, metadata: { tag: a.assetTag } });
  await notifyUsers([c.requestedById], { kind: "REQUEST", title: `${approve ? "Approved" : "Not approved"}: write off ${a.item} (${a.assetTag})`, body: note.slice(0, 200), href: "/assets" });
  await syncLab(a.labId);
}

/** Stock-taking: what was found and what is missing; signing it off makes the register the source of the lab's figures. */
export async function verify(by: { id: string }, chairmanId: string, labId: string, foundTags: string[], note: string) {
  const items = (await adb.asset.findMany({ where: { chairmanId, labId, status: { not: "CONDEMNED" } } })) as Asset[];
  if (!items.length) throw new Error("No items registered in this lab yet.");
  const set = new Set(foundTags.map((t) => t.trim().toUpperCase()).filter(Boolean));
  const found = items.filter((i) => set.size === 0 || set.has(i.assetTag)), missing = items.filter((i) => set.size > 0 && !set.has(i.assetTag));
  await adb.assetVerification.create({ data: { id: randomUUID(), chairmanId, labId, year: new Date().getFullYear(), foundIds: JSON.stringify(found.map((f) => f.id)), missingIds: JSON.stringify(missing.map((m) => m.id)), note: note.slice(0, 1000) || null, verifiedById: by.id } });
  await syncLab(labId);
  return { found: found.length, missing: missing.map((m) => m.assetTag) };
}

/** LabInfo / LabComputerSpec from the register — only for labs whose count has been signed off (until then the typed figures stay). */
export async function syncLab(labId: string | null) {
  if (!labId) return false;
  try {
    if (!(await adb.assetVerification.count({ where: { labId } }))) return false;
    const pcs = (await adb.asset.findMany({ where: { labId, category: "COMPUTER", status: { not: "CONDEMNED" } } })) as Asset[];
    const lab = await prisma.labInfo.findUnique({ where: { id: labId } });
    if (!lab) return false;
    await prisma.labInfo.update({ where: { id: labId }, data: { computers: pcs.length, computersWorking: pcs.filter((p) => p.status === "WORKING").length, lastAudit: (await adb.assetVerification.findFirst({ where: { labId }, orderBy: { verifiedAt: "desc" } }))?.verifiedAt || lab.lastAudit } });
    const groups = new Map<string, { a: Asset; n: number }>();
    for (const p of pcs) { const k = [p.makeModel, p.processor, p.ramGb, p.storage, p.gpu, p.os, p.purchaseDate ? new Date(p.purchaseDate).getFullYear() : ""].join("|"); const g = groups.get(k) || { a: p, n: 0 }; g.n++; groups.set(k, g); }
    await prisma.labComputerSpec.deleteMany({ where: { labId } });
    for (const { a, n } of groups.values()) await prisma.labComputerSpec.create({ data: { chairmanId: lab.chairmanId, labId, quantity: n, makeModel: a.makeModel, processor: a.processor, ramGb: a.ramGb, storage: a.storage, gpu: a.gpu, os: a.os, purchaseYear: a.purchaseDate ? new Date(a.purchaseDate).getFullYear() : null, notes: "From the asset register" } });
    return true;
  } catch { return false; }
}

/** Reports: by lab (count, value, working computers), age, out of warranty, downtime and repeated faults (12 months). */
export async function assetReport(chairmanId: string, labIds: string[] | null) {
  const where = { chairmanId, ...(labIds ? { labId: { in: labIds.concat(["none"]) } } : {}) };
  const [items, faults] = await Promise.all([
    adb.asset.findMany({ where }) as Promise<Asset[]>,
    adb.assetFault.findMany({ where: { chairmanId, reportedAt: { gte: new Date(Date.now() - 365 * 864e5) } } }) as Promise<Fault[]>,
  ]);
  const live = items.filter((i) => i.status !== "CONDEMNED"), ids = new Set(items.map((i) => i.id));
  const now = Date.now();
  const myFaults = faults.filter((f) => ids.has(f.assetId));
  const downtimeH = myFaults.reduce((t, f) => t + ((f.fixedAt ? new Date(f.fixedAt).getTime() : now) - new Date(f.reportedAt).getTime()) / 3600_000, 0);
  const per = new Map<string, number>(); for (const f of myFaults) per.set(f.assetId, (per.get(f.assetId) || 0) + 1);
  const ages = live.filter((i) => i.purchaseDate).map((i) => (now - new Date(i.purchaseDate!).getTime()) / (365.25 * 864e5));
  return {
    items: live.length, value: Math.round(live.reduce((t, i) => t + (i.cost || 0), 0)), condemned: items.length - live.length,
    byStatus: Object.fromEntries(Object.keys(STATUS).map((k) => [k, items.filter((i) => i.status === k).length])),
    byCategory: Object.entries(CATEGORIES).map(([k, l]) => ({ label: l, n: live.filter((i) => i.category === k).length })).filter((x) => x.n),
    avgAge: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null,
    outOfWarranty: live.filter((i) => i.warrantyEnd && new Date(i.warrantyEnd).getTime() < now),
    repeated: Array.from(per.entries()).filter(([, n]) => n >= 3).map(([id, n]) => ({ asset: items.find((i) => i.id === id)!, faults: n })),
    downtimeHours: Math.round(downtimeH), openFaults: myFaults.filter((f) => ["OPEN", "REPAIRING"].includes(f.status)).length,
  };
}
