import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { syncLab } from "./assets";

// Dream University's asset register: the Software Lab fully registered (40 computers in two models, a projector, a
// switch) and its yearly count signed off — so its computer figures now come from the register; the AI Lab only partly
// registered (its typed figures stay); faults (one open from a student's QR scan, one under repair, one fixed, a PC
// with repeated faults) and an old projector waiting for the Institute Head's write-off approval.

export async function campusAssets() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { if (await rdb.asset.count({ where: { chairmanId: H } })) return ["Asset demo already there"]; } catch { throw new Error("Run prisma/migration_assets.sql first."); }
  const labs = await prisma.labInfo.findMany({ where: { chairmanId: H }, select: { id: true, name: true } });
  const sw = labs.find((l) => /software/i.test(l.name)), ai = labs.find((l) => /ai/i.test(l.name));
  const eng = await prisma.user.findFirst({ where: { username: "dream.labeng" }, select: { id: true } });
  const fac = await prisma.user.findFirst({ where: { username: "dream.facilities" }, select: { id: true } });
  const ids: Record<string, string> = {};
  const add = async (tag: string, o: Record<string, unknown>) => { const id = randomUUID(); ids[tag] = id; await rdb.asset.create({ data: { id, chairmanId: H, assetTag: tag, custodianId: eng?.id || null, ...o } }); };
  if (sw) {
    for (let i = 1; i <= 40; i++) {
      const dell = i <= 30;
      await add(`SWL-${String(i).padStart(4, "0")}`, { labId: sw.id, category: "COMPUTER", item: "Desktop computer", makeModel: dell ? "Dell OptiPlex 7090" : "HP ProDesk 400 G7", serialNo: `${dell ? "DL" : "HP"}${7000 + i}`, processor: dell ? "Intel Core i7-11700" : "Intel Core i5-10500", ramGb: dell ? 16 : 8, storage: dell ? "512 GB SSD" : "256 GB SSD", os: "Windows 11 Pro", purchaseDate: new Date(dell ? "2023-08-10" : "2021-02-01"), cost: dell ? 215000 : 145000, supplier: dell ? "Galaxy Computers, Lahore" : "TechZone Pvt Ltd", warrantyEnd: new Date(dell ? "2026-08-10" : "2024-02-01"), status: i === 12 ? "FAULTY" : i === 33 ? "UNDER_REPAIR" : "WORKING" });
    }
    await add("SWL-PRJ-01", { labId: sw.id, category: "PROJECTOR", item: "Multimedia projector", makeModel: "Epson EB-X51", purchaseDate: new Date("2016-05-01"), cost: 95000, warrantyEnd: new Date("2018-05-01"), status: "FAULTY" });
    await add("SWL-NET-01", { labId: sw.id, category: "NETWORK", item: "48-port network switch", makeModel: "Cisco CBS350-48T", purchaseDate: new Date("2023-08-10"), cost: 180000, warrantyEnd: new Date("2028-08-10") });
  }
  if (ai) for (let i = 1; i <= 10; i++) await add(`AIL-${String(i).padStart(4, "0")}`, { labId: ai.id, category: "COMPUTER", item: "GPU workstation", makeModel: "Lenovo ThinkStation P360", processor: "Intel Core i9-12900", ramGb: 32, storage: "1 TB NVMe SSD", gpu: "NVIDIA RTX A4000 16 GB", os: "Ubuntu 22.04", purchaseDate: new Date("2025-01-15"), cost: 640000, supplier: "Galaxy Computers, Lahore", warrantyEnd: new Date("2028-01-15") });
  await add("HALL-PRJ-01", { room: "Seminar Hall", category: "PROJECTOR", item: "Laser projector", makeModel: "Epson EB-L630U", purchaseDate: new Date("2024-03-01"), cost: 520000, warrantyEnd: new Date("2027-03-01"), custodianId: fac?.id || null });

  const fault = async (tag: string, days: number, text: string, by: string, status: string, steps: [number, string][] = [], cost: number | null = null, fixedDays: number | null = null) => {
    if (!ids[tag]) return;
    await rdb.assetFault.create({ data: { id: randomUUID(), chairmanId: H, assetId: ids[tag], description: text, reportedBy: by, reportedAt: new Date(Date.now() - days * 864e5), status, stepsJson: JSON.stringify(steps.map(([d, t]) => ({ at: new Date(Date.now() - d * 864e5).toISOString(), by: "Lab Engineer", text: t }))), cost, fixedAt: fixedDays === null ? null : new Date(Date.now() - fixedDays * 864e5) } });
  };
  await fault("SWL-0012", 1, "Does not start — power light blinks orange.", "Ahmed Khan (student)", "OPEN");
  await fault("SWL-0033", 6, "Blue screen when opening Visual Studio.", "Ms. Fatima Butt", "REPAIRING", [[5, "Memory test failed on one RAM stick"], [3, "Replacement RAM ordered from Galaxy Computers"]], 6500);
  for (const [d, f] of [[200, 7], [120, 6], [40, 39]] as [number, number][]) await fault("SWL-0007", d, "Keyboard and mouse stop responding.", "Student (not signed in)", "FIXED", [[f, "Replaced USB hub / reseated cables"]], 1200, f);
  await fault("SWL-PRJ-01", 30, "Image very dim; lamp warning.", "Dr. Iqra Mirza", "OPEN");
  if (ids["SWL-PRJ-01"]) await rdb.assetCondemnation.create({ data: { id: randomUUID(), chairmanId: H, assetId: ids["SWL-PRJ-01"], reason: "Ten years old, lamp and board failing; repair costs more than half a new projector.", committeeNote: "Condemnation committee (Facilities Manager, Lab Manager, Finance Officer) met on 15 Oct 2026 and recommends write-off.", requestedById: eng?.id || H } });
  // The Software Lab's count, signed off: from now on its computer figures come from the register.
  if (sw) {
    const all = (await rdb.asset.findMany({ where: { labId: sw.id }, select: { id: true } })) as { id: string }[];
    await rdb.assetVerification.create({ data: { id: randomUUID(), chairmanId: H, labId: sw.id, year: new Date().getFullYear(), foundIds: JSON.stringify(all.map((a) => a.id)), missingIds: "[]", note: "Annual stock-taking, all items present.", verifiedById: eng?.id || H } });
    await syncLab(sw.id);
  }
  return [`${Object.keys(ids).length} items registered (Software Lab complete and counted; AI Lab partly; Seminar Hall projector)`, "faults: one open from a QR scan, one under repair, a PC with three faults this year", "an old projector waiting for the Institute Head's write-off approval"];
}
