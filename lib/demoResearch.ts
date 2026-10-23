import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { addCandidates } from "./research";

// Dream University's research office: an ORIC member named, a journal list with HEC categories, grant proposals in
// every state (one awarded — already in the funded projects register), a teacher's ORCID linked with imported papers
// waiting to be confirmed (one is already on the profile, so it is skipped), and BibTeX imported for another.

export async function campusResearch() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { if (await rdb.grantProposal.count({ where: { chairmanId: H } })) return ["Research demo already there"]; } catch { throw new Error("Run prisma/migration_research.sql first."); }
  const users = await prisma.user.findMany({ where: { username: { in: ["dream.t3", "dream.t4", "dream.t5", "dream.b1", "dream.hod.cs", "dream.dean"] } }, select: { id: true, username: true, name: true, departmentId: true } });
  const u = (x: string) => users.find((y) => y.username === x)!;
  await rdb.researchSetting.create({ data: { chairmanId: H, oricUserIds: JSON.stringify([u("dream.dean").id]) } });
  for (const [title, issn, category, ifac] of [["IEEE Access", "2169-3536", "W", 3.9], ["Applied Sciences", "2076-3417", "X", 2.7], ["Mehran University Research Journal of Engineering and Technology", "0254-7821", "Y", null], ["Pakistan Journal of Commerce and Social Sciences", "1997-8553", "X", null], ["Expert Systems with Applications", "0957-4174", "W", 8.5]] as [string, string, string, number | null][])
    await rdb.journalCategory.create({ data: { id: randomUUID(), chairmanId: H, title, issn, category, impactFactor: ifac } });
  const d = (days: number) => new Date(Date.now() + days * 864e5);
  const prop = async (pi: string, o: Record<string, unknown>) => { const id = randomUUID(); await rdb.grantProposal.create({ data: { id, chairmanId: H, piId: u(pi).id, createdAt: d(-60), updatedAt: d(-5), ...o } }); return id; };
  await prop("dream.t3", { title: "Urdu handwriting recognition for exam scripts", agency: "HEC NRPU", callName: "NRPU 2026", amount: 6500000, durationMonths: 24, coInvestigators: "Dr. Iqra Mirza", abstract: "A deep-learning system that reads handwritten Urdu answers to speed up marking and give earlier feedback.", status: "INTERNAL_REVIEW" });
  await prop("dream.t5", { title: "Low-cost IoT sensors for campus energy use", agency: "Ignite National Technology Fund", amount: 2800000, durationMonths: 12, status: "SUBMITTED", submittedAt: d(-20), reviewedById: u("dream.dean").id, reviewNote: "Cleared — attach the budget breakdown." });
  await prop("dream.t4", { title: "Explainable credit scoring for microfinance", agency: "Pakistan Science Foundation", amount: 1500000, durationMonths: 18, status: "RETURNED", reviewedById: u("dream.dean").id, reviewNote: "Add an ethics section and the data-sharing letter from the bank." });
  // An award (already in the register and on the PI's profile).
  const rec = await prisma.accreditationRecord.create({ data: { chairmanId: H, kind: "FUNDED_PROJECT", title: "Machine learning for early dropout warning", departmentId: u("dream.hod.cs").departmentId, dataJson: JSON.stringify({ agency: "HEC Technology Development Fund", start: "2026-07-01", end: "2027-06-30", pi: u("dream.hod.cs").name, amount: 3200000, share: "" }), recordDate: new Date("2026-07-01"), createdById: H } as never });
  await prop("dream.hod.cs", { title: "Machine learning for early dropout warning", agency: "HEC Technology Development Fund", amount: 3500000, awardedAmount: 3200000, durationMonths: 12, status: "AWARDED", submittedAt: d(-150), decidedAt: d(-110), startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), fundedRecordId: (rec as { id: string }).id });
  await prisma.facultyRecord.create({ data: { userId: u("dream.hod.cs").id, kind: "GRANT", title: "Machine learning for early dropout warning", organisation: "HEC Technology Development Fund", amount: "PKR 3,200,000", startYear: 2026, endYear: 2027, status: "Awarded", role: "Principal investigator" } as never });
  // ORCID linked (the real lookup runs when the teacher presses "Import from ORCID"; here the works it would bring are added).
  await rdb.researchProfile.create({ data: { userId: u("dream.t3").id, chairmanId: H, orcid: "0000-0002-1825-0097", scholarUrl: "https://scholar.google.com/citations?user=DEMO123", lastImportAt: d(-1) } });
  const existing = await prisma.facultyRecord.findFirst({ where: { userId: u("dream.t3").id, kind: "PUBLICATION" }, select: { title: true } });
  const r1 = await addCandidates(u("dream.t3").id, H, "ORCID", [
    { title: "Attention-based models for Urdu optical character recognition", journal: "IEEE Access", year: 2025, doi: "10.1109/ACCESS.2025.1234567", citations: 14 },
    { title: "Predicting student dropout with gradient boosting", journal: "Applied Sciences", year: 2024, doi: "10.3390/app14031234", citations: 9 },
    { title: "A survey of handwriting datasets for South Asian scripts", journal: "Expert Systems with Applications", year: 2026, doi: "10.1016/j.eswa.2026.123456", citations: 2 },
    ...(existing ? [{ title: existing.title, journal: "—", year: 2023 }] : []),
  ]);
  const r2 = await addCandidates(u("dream.b1").id, H, "BIBTEX", [{ title: "Islamic microfinance and women entrepreneurs in Punjab", journal: "Pakistan Journal of Commerce and Social Sciences", year: 2025, authors: "B1; A. Khan" }]);
  return ["ORIC: the Dean named; 5 journals with HEC categories", "4 grant proposals: one with ORIC for review (in My Approvals), one submitted, one returned, one awarded (in the funded projects register)", `ORCID linked for one teacher: ${r1.added} papers to confirm${r1.duplicates ? `, ${r1.duplicates} already on the profile (skipped)` : ""}; ${r2.added} from a BibTeX paste for another`];
}
