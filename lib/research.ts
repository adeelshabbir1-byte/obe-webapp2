import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";

// Research office (ORIC). Faculty submit grant proposals (draft → ORIC review → submitted to the agency → awarded or
// not); an award becomes a FUNDED_PROJECT register record and a GRANT record on the PI's profile. Faculty link their
// ORCID iD (imported through ORCID's public API) or paste a Google Scholar BibTeX export / a list (no scraping); each
// imported paper waits for the faculty member to confirm it, is de-duplicated against their profile, and takes its HEC
// category from the institute's journal list. The research dashboard counts what is on the profiles.

export const xdb = prisma as unknown as Record<string, any>;
export const RES_HINT = "Run prisma/migration_research.sql in Supabase first.";
export const STATUS: Record<string, string> = { DRAFT: "Draft", INTERNAL_REVIEW: "With ORIC for review", RETURNED: "Returned for changes", SUBMITTED: "Submitted to the agency", AWARDED: "Awarded", REJECTED: "Not funded" };
export type Proposal = { id: string; chairmanId: string; piId: string; title: string; agency: string; callName: string | null; amount: number | null; durationMonths: number | null; coInvestigators: string | null; abstract: string | null; status: string; reviewNote: string | null; reviewedById: string | null; submittedAt: Date | null; decidedAt: Date | null; awardedAmount: number | null; startDate: Date | null; endDate: Date | null; fundedRecordId: string | null; createdAt: Date };
export type Candidate = { id: string; userId: string; source: string; dedupeKey: string; title: string; journal: string | null; year: number | null; doi: string | null; authors: string | null; citations: number | null; category: string | null; impactFactor: number | null; status: string; studentWork: boolean; recordId: string | null };

export const dedupeKey = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 120);
export async function oricIds(chairmanId: string): Promise<string[]> {
  try { const s = await xdb.researchSetting.findUnique({ where: { chairmanId } }); return JSON.parse(s?.oricUserIds || "[]"); } catch { return []; }
}
export const isOric = async (w: { id: string; head: boolean; chairmanId: string }) => w.head || (await oricIds(w.chairmanId)).includes(w.id);

// ---- Grants ----
export async function submitForReview(by: { id: string; name: string }, id: string) {
  const p = (await xdb.grantProposal.findUnique({ where: { id } })) as Proposal | null;
  if (!p || p.piId !== by.id || !["DRAFT", "RETURNED"].includes(p.status)) throw new Error("Not found.");
  await xdb.grantProposal.update({ where: { id }, data: { status: "INTERNAL_REVIEW", updatedAt: new Date() } });
  const head = await prisma.user.findUnique({ where: { id: p.chairmanId }, select: { id: true } });
  const ids = await oricIds(p.chairmanId);
  await notifyUsers(ids.length ? ids : [head?.id], { kind: "REQUEST", title: `Grant proposal for review: ${p.title}`, body: `${by.name} · ${p.agency}`, href: "/research?tab=grants" });
}
export async function review(by: { id: string }, id: string, ok: boolean, note: string) {
  const p = (await xdb.grantProposal.findUnique({ where: { id } })) as Proposal | null;
  if (!p || p.status !== "INTERNAL_REVIEW") throw new Error("This proposal is not waiting for review.");
  if (!ok && note.trim().length < 3) throw new Error("Say what needs changing.");
  await xdb.grantProposal.update({ where: { id }, data: { status: ok ? "SUBMITTED" : "RETURNED", reviewNote: note.slice(0, 1000) || null, reviewedById: by.id, submittedAt: ok ? new Date() : null, updatedAt: new Date() } });
  await notifyUsers([p.piId], { kind: "REQUEST", title: ok ? `Cleared by ORIC — submit to ${p.agency}: ${p.title}` : `Returned by ORIC: ${p.title}`, body: note.slice(0, 200), href: "/research?tab=grants" });
}
/** The agency's decision. An award makes the FUNDED_PROJECT register record and the GRANT record on the PI's profile. */
export async function decide(by: { id: string }, id: string, awarded: boolean, o: { amount: number | null; start: Date | null; end: Date | null }) {
  const p = (await xdb.grantProposal.findUnique({ where: { id } })) as Proposal | null;
  if (!p || p.status !== "SUBMITTED") throw new Error("Only a submitted proposal can be awarded or marked not funded.");
  if (!awarded) { await xdb.grantProposal.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date(), updatedAt: new Date() } }); return; }
  const pi = await prisma.user.findUnique({ where: { id: p.piId }, select: { name: true, departmentId: true } });
  const amount = o.amount ?? p.amount;
  const rec = await prisma.accreditationRecord.create({ data: { chairmanId: p.chairmanId, kind: "FUNDED_PROJECT", title: p.title, departmentId: pi?.departmentId || null, dataJson: JSON.stringify({ agency: p.agency, start: o.start ? o.start.toISOString().slice(0, 10) : "", end: o.end ? o.end.toISOString().slice(0, 10) : "", pi: pi?.name || "", amount: amount || 0, share: "" }), recordDate: o.start || new Date(), createdById: by.id } as never });
  await prisma.facultyRecord.create({ data: { userId: p.piId, kind: "GRANT", title: p.title, organisation: p.agency, amount: amount ? `PKR ${Math.round(amount).toLocaleString("en-PK")}` : null, startYear: (o.start || new Date()).getFullYear(), endYear: o.end ? o.end.getFullYear() : null, status: "Awarded", role: "Principal investigator" } as never }).catch(() => {});
  await xdb.grantProposal.update({ where: { id }, data: { status: "AWARDED", awardedAmount: amount, startDate: o.start, endDate: o.end, decidedAt: new Date(), fundedRecordId: (rec as { id: string }).id, updatedAt: new Date() } });
  await writeAuditLog({ actorUserId: by.id, action: "GRANT_AWARDED", entityType: "GrantProposal", entityId: id, metadata: { amount: amount || 0 } });
  await notifyUsers([p.piId], { kind: "REQUEST", title: `Congratulations — grant awarded: ${p.title}`, body: "Added to the funded projects register and your profile.", href: "/research?tab=grants" });
}

// ---- Publications import ----
type Raw = { title: string; journal?: string | null; year?: number | null; doi?: string | null; authors?: string | null; citations?: number | null };

/** ORCID public API (no key): the person's works. */
export async function fetchOrcid(orcid: string): Promise<Raw[]> {
  const id = orcid.trim().replace(/^https?:\/\/orcid\.org\//, "");
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) throw new Error("An ORCID iD looks like 0000-0002-1825-0097.");
  const r = await fetch(`https://pub.orcid.org/v3.0/${id}/works`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(r.status === 404 ? "No ORCID record with this iD." : `ORCID did not answer (${r.status}). Try again later.`);
  const d = (await r.json()) as { group?: { "work-summary"?: { title?: { title?: { value?: string } }; "journal-title"?: { value?: string } | null; "publication-date"?: { year?: { value?: string } } | null; "external-ids"?: { "external-id"?: { "external-id-type": string; "external-id-value": string }[] } }[] }[] };
  return (d.group || []).map((g) => g["work-summary"]?.[0]).filter(Boolean).map((w) => ({
    title: w!.title?.title?.value || "", journal: w!["journal-title"]?.value || null, year: Number(w!["publication-date"]?.year?.value) || null,
    doi: w!["external-ids"]?.["external-id"]?.find((e) => e["external-id-type"] === "doi")?.["external-id-value"] || null,
  })).filter((w) => w.title);
}
/** A BibTeX export (Google Scholar: select the papers → Export → BibTeX). */
export function parseBibtex(text: string): Raw[] {
  const out: Raw[] = [];
  for (const entry of text.split(/@\w+\s*\{/).slice(1)) {
    const f = (k: string) => { const m = new RegExp(`\\b${k}\\s*=\\s*(\\{((?:[^{}]|\\{[^{}]*\\})*)\\}|"([^"]*)"|(\\d+))`, "i").exec(entry); return m ? (m[2] ?? m[3] ?? m[4] ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim() : ""; };
    const title = f("title"); if (!title) continue;
    out.push({ title, journal: f("journal") || f("booktitle") || null, year: Number(f("year")) || null, doi: f("doi") || null, authors: f("author").replace(/ and /g, "; ") || null });
  }
  return out;
}
/** A plain list, one per line: Title | Journal | Year | DOI | Citations. */
export function parseLines(text: string): Raw[] {
  return text.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0] && p[0].length > 5)
    .map(([title, journal, year, doi, cites]) => ({ title, journal: journal || null, year: Number(year) || null, doi: doi || null, citations: Number(cites) || null }));
}
/** Add imported papers as candidates: skip what is already on the profile or already waiting; fill the HEC category from the journal list. */
export async function addCandidates(userId: string, chairmanId: string, source: string, items: Raw[]) {
  const have = new Set((await prisma.facultyRecord.findMany({ where: { userId, kind: "PUBLICATION" }, select: { title: true } })).map((r) => dedupeKey(r.title)));
  const journals = (await xdb.journalCategory.findMany({ where: { chairmanId } }).catch(() => [])) as { title: string; issn: string | null; category: string; impactFactor: number | null }[];
  const jmap = new Map(journals.map((j) => [dedupeKey(j.title), j]));
  let added = 0, dup = 0;
  for (const it of items.slice(0, 500)) {
    const key = dedupeKey(it.title); if (!key) continue;
    if (have.has(key)) { dup++; continue; }
    const j = it.journal ? jmap.get(dedupeKey(it.journal)) : undefined;
    try { await xdb.publicationCandidate.create({ data: { id: randomUUID(), userId, source, dedupeKey: key, title: it.title.slice(0, 500), journal: it.journal?.slice(0, 300) || null, year: it.year || null, doi: it.doi?.slice(0, 200) || null, authors: it.authors?.slice(0, 1000) || null, citations: it.citations ?? null, category: j?.category || null, impactFactor: j?.impactFactor ?? null } }); added++; }
    catch { dup++; } // already waiting
  }
  return { added, duplicates: dup };
}
/** The faculty member confirms a paper: it goes onto their profile (counted by NBEAC Form 5, NCEAC, the dashboards). */
export async function confirm(userId: string, id: string, o: { category: string; studentWork: boolean; add: boolean }) {
  const c = (await xdb.publicationCandidate.findUnique({ where: { id } })) as Candidate | null;
  if (!c || c.userId !== userId || c.status !== "PENDING") throw new Error("Not found.");
  if (!o.add) { await xdb.publicationCandidate.update({ where: { id }, data: { status: "IGNORED" } }); return; }
  const cat = ["W", "X", "Y", "OTHER"].includes(o.category) ? o.category : c.category || "OTHER";
  const rec = await prisma.facultyRecord.create({ data: { userId, kind: "PUBLICATION", title: c.title, organisation: c.journal, startYear: c.year, category: cat === "OTHER" ? "Other" : cat, link: c.doi ? `https://doi.org/${c.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : null, details: [c.authors ? `Authors: ${c.authors}` : "", c.citations ? `Citations: ${c.citations}` : "", c.impactFactor ? `Impact factor: ${c.impactFactor}` : "", o.studentWork ? "With a student (FYP / thesis)" : ""].filter(Boolean).join("\n") || null } as never });
  await xdb.publicationCandidate.update({ where: { id }, data: { status: "ADDED", category: cat, studentWork: o.studentWork, recordId: (rec as { id: string }).id } });
}

/** The research dashboard: papers per teacher and year, HEC categories, citations, grants applied / awarded, student co-authored papers. */
export async function researchDashboard(chairmanId: string, departmentIds: string[] | null) {
  const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "CHAIRMAN"] }, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }], ...(departmentIds ? { departmentId: { in: departmentIds.concat(["none"]) } } : {}) }, select: { id: true, name: true } });
  const ids = staff.map((s) => s.id).concat(["none"]);
  const year = new Date().getFullYear(), years = [year - 4, year - 3, year - 2, year - 1, year];
  const [pubs, cands, props] = await Promise.all([
    prisma.facultyRecord.findMany({ where: { userId: { in: ids }, kind: "PUBLICATION" }, select: { userId: true, startYear: true, category: true, details: true } }),
    xdb.publicationCandidate.findMany({ where: { userId: { in: ids }, status: "ADDED" }, select: { citations: true } }).catch(() => []) as Promise<{ citations: number | null }[]>,
    xdb.grantProposal.findMany({ where: { chairmanId } }).catch(() => []) as Promise<Proposal[]>,
  ]);
  const cat = (c: string | null) => (c === "W" || c === "X" || c === "Y" ? c : c && /impact/i.test(c) ? "W" : "Other");
  const perTeacher = staff.map((s) => { const mine = pubs.filter((p) => p.userId === s.id); return { name: s.name, byYear: years.map((y) => mine.filter((p) => p.startYear === y).length), total: mine.length, w: mine.filter((p) => cat(p.category) === "W").length }; }).filter((t) => t.total).sort((a, b) => b.total - a.total);
  const myProps = props.filter((p) => ids.includes(p.piId));
  return {
    years, perTeacher, total: pubs.length, thisYear: pubs.filter((p) => p.startYear === year).length,
    byCategory: ["W", "X", "Y", "Other"].map((c) => ({ c, n: pubs.filter((p) => cat(p.category) === c).length })),
    citations: cands.reduce((t, c) => t + (c.citations || 0), 0), studentWork: pubs.filter((p) => /With a student/i.test(p.details || "")).length,
    grants: { applied: myProps.filter((p) => p.status !== "DRAFT").length, awarded: myProps.filter((p) => p.status === "AWARDED").length, appliedAmount: Math.round(myProps.filter((p) => p.status !== "DRAFT").reduce((t, p) => t + (p.amount || 0), 0)), awardedAmount: Math.round(myProps.filter((p) => p.status === "AWARDED").reduce((t, p) => t + (p.awardedAmount || p.amount || 0), 0)) },
  };
}
