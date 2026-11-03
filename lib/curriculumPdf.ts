import { prisma } from "./db";
import { PdfDoc } from "./pdfDoc";
import { countedCredits } from "./courseTypes";
import { semLabel, coursePlos, type Curriculum } from "./masterCurriculumDownload";

// The curriculum as a PDF laid out like HEC curriculum documents (queue item 11): cover, contents, the people who built
// it, a short factual introduction, graduate attributes, the scheme of studies with credit totals, every course outline
// and the course–PLO matrix. The people come only from OBEHUB's records; a role with nobody recorded is left out.
const db = prisma as unknown as Record<string, any>;
type Person = { name: string; role: string; where: string };

export async function contributorsOf(c: Curriculum): Promise<{ title: string; people: Person[] }[]> {
  const out: { title: string; people: Person[] }[] = [];
  const designers = new Map<string, string[]>();
  for (const k of c.courses as unknown as { code: string; designerId?: string | null }[]) if (k.designerId) designers.set(k.designerId, [...(designers.get(k.designerId) || []), k.code]);
  const ids = Array.from(designers.keys());
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, organization: true } }) : [];
  const nm = new Map<string, { name: string; organization: string | null }>(users.map((u) => [u.id as string, { name: u.name as string, organization: (u.organization as string | null) ?? null }]));
  if (!c.chairmanId) {
    // A national curriculum: the platform's curriculum team for this council and program.
    const teams = ((await db.platformTeam?.findMany({}).catch(() => [])) || []) as { id: string; name: string; councilsJson: string; programsJson: string }[];
    const L = (s: string) => { try { return (JSON.parse(s || "[]") as string[]).map((x) => x.toLowerCase()); } catch { return []; } };
    const mine = teams.filter((t) => { const cs = L(t.councilsJson), ps = L(t.programsJson); return (!cs.length || cs.includes(c.authority.toLowerCase())) && (!ps.length || ps.some((p) => `${c.title} ${c.degreeProgram || ""}`.toLowerCase().includes(p))); });
    if (mine.length) {
      const ms = ((await db.platformTeamMember.findMany({ where: { teamId: { in: mine.map((t) => t.id) } } }).catch(() => [])) || []) as { userId: string; role: string; teamId: string }[];
      const us = await prisma.user.findMany({ where: { id: { in: ms.map((m) => m.userId).concat("none") } }, select: { id: true, name: true, organization: true } });
      const people = ms.map((m) => { const u = us.find((x) => x.id === m.userId); return u ? { name: u.name, role: m.role === "CONVENER" ? "Convener" : "Member", where: u.organization || "" } : null; }).filter((x): x is Person => !!x).sort((a, b) => Number(b.role === "Convener") - Number(a.role === "Convener") || a.name.localeCompare(b.name));
      if (people.length) out.push({ title: `National Curriculum Committee — ${mine.map((t) => t.name).join(", ")}`, people });
    }
  } else {
    // A university's own version: its curriculum committees (OMC, BOS) and the Dean's approval.
    const cs = ((await db.cmtCommittee?.findMany({ where: { chairmanId: c.chairmanId, type: { in: ["OMC", "BOS"] } } }).catch(() => [])) || []) as { id: string; name: string; type: string; convenerId: string | null }[];
    const { metaOf } = await import("./committeeMeta");
    for (const k of cs) {
      const ms = ((await db.cmtMember.findMany({ where: { committeeId: k.id } }).catch(() => [])) || []) as { id: string; userId: string | null; name: string; organisation: string | null; external: boolean }[];
      const meta = await metaOf(c.chairmanId, k.id).catch(() => ({ roles: {} as Record<string, { role: string }> }));
      const people = ms.map((m) => ({ name: m.name, role: m.userId && m.userId === k.convenerId ? "Convener" : meta.roles[m.id]?.role || (m.external ? "External expert" : "Member"), where: m.organisation || "" })).sort((a, b) => Number(b.role === "Convener") - Number(a.role === "Convener") || a.name.localeCompare(b.name));
      if (people.length) out.push({ title: k.name, people });
    }
    const deans = ((await db.curriculumDeanApproval?.findMany({ where: { curriculumId: c.id, status: "APPROVED" } }).catch(() => [])) || []) as { decidedById: string; decidedAt: Date }[];
    if (deans.length) {
      const us = await prisma.user.findMany({ where: { id: { in: deans.map((d) => d.decidedById) } }, select: { id: true, name: true } });
      out.push({ title: "Approved by", people: deans.map((d) => ({ name: us.find((u) => u.id === d.decidedById)?.name || "", role: "Dean", where: new Date(d.decidedAt).toISOString().slice(0, 10) })).filter((p) => p.name) });
    }
  }
  if (designers.size) out.push({ title: "Course designers (Subject Experts)", people: Array.from(designers.entries()).map(([id, codes]) => ({ name: nm.get(id)?.name || "", role: codes.join(", "), where: nm.get(id)?.organization || "" })).filter((p) => p.name) });
  return out;
}

export async function curriculumPdf(c: Curriculum) {
  const pdf = await PdfDoc.create(`${c.authority} ${c.title} (${c.version})`);
  const placed = c.courses.filter((k) => k.semesterNumber);
  const total = countedCredits(placed);
  // Cover
  pdf.y -= 160;
  pdf.text(c.authority, { size: 14, bold: true });
  pdf.text(`Curriculum of ${c.title}`, { size: 24, bold: true, gap: 8 });
  pdf.text(`Version ${c.version}${c.publicationDate ? ` · ${new Date(c.publicationDate).toISOString().slice(0, 10)}` : ""}`, { size: 12 });
  if (c.sourceReference) pdf.text(`Reference: ${c.sourceReference}`, { size: 11 });
  pdf.text(`${c.courses.length} courses · ${c.plos.length} graduate attributes · ${total} credit hours in the scheme of studies`, { size: 11, gap: 20 });
  pdf.note(`Generated by OBEHUB on ${new Date().toISOString().slice(0, 10)} from the curriculum on record.`);
  // Contents
  const people = await contributorsOf(c);
  pdf.newPage(); pdf.title("Contents");
  ["Curriculum committee and contributors", "Introduction", "Graduate attributes (PLOs)", "Scheme of studies", "Course outlines", "Course–PLO matrix"].filter((x, i) => i !== 0 || people.length).forEach((x, i) => pdf.text(`${i + 1}.  ${x}`, { size: 11 }));
  // Contributors
  if (people.length) {
    pdf.newPage(); pdf.h1("Curriculum committee and contributors");
    for (const g of people) { pdf.h2(g.title); pdf.table([["Name", 34], ["Role", 33], ["Institution / date", 33]], g.people.map((p) => [p.name, p.role, p.where])); }
  }
  // Introduction (facts only)
  pdf.newPage(); pdf.h1("Introduction");
  pdf.text(`This document sets out the ${c.title} curriculum (${c.authority}, version ${c.version}). It lists the graduate attributes the programme develops, the scheme of studies by semester with credit hours, and an outline of every course: its learning outcomes with Bloom levels and the graduate attributes they serve, the topics week by week, and the books.`);
  // GAs
  pdf.h1("Graduate attributes (PLOs)");
  pdf.table([["PLO", 10], ["Title", 30], ["Description", 60]], c.plos.map((x) => [`PLO-${x.number}`, x.title, x.description]));
  // Scheme
  pdf.newPage(); pdf.h1("Scheme of studies");
  const sems: (number | null)[] = Array.from(new Set<number | null>(c.courses.map((k) => k.semesterNumber as number | null))).sort((a: number | null, b: number | null) => (a ?? 99) - (b ?? 99));
  for (const s of sems) {
    const list = c.courses.filter((k) => k.semesterNumber === s);
    pdf.h2(`${semLabel(s)} — ${countedCredits(list)} credit hours`);
    pdf.table([["Code", 12], ["Course", 40], ["Cr", 6], ["Category", 18], ["Prerequisite", 12], ["PLOs", 12]], list.map((k) => [k.code, k.title, k.creditHours, k.category, k.prerequisiteCourse?.code || "", coursePlos(k).join(", ")]));
  }
  pdf.text(`Total in the scheme: ${total} credit hours.`, { bold: true });
  // Course outlines
  for (const k of c.courses) {
    pdf.newPage(); pdf.h1(`${k.code} — ${k.title}`);
    pdf.kv([["Credit hours", Number(k.creditHours)], ["Category", `${k.category}${k.domain ? ` (${k.domain})` : ""}`], ["Semester", semLabel(k.semesterNumber as number | null)], ["Prerequisite", k.prerequisiteCourse ? `${k.prerequisiteCourse.code} ${k.prerequisiteCourse.title}` : "None"]]);
    if (k.catalogDescription) { pdf.h2("Course description"); pdf.text(k.catalogDescription); }
    if (k.seedClos.length) { pdf.h2("Course learning outcomes"); pdf.table([["CLO", 9], ["Statement", 67], ["Bloom", 12], ["PLO", 12]], k.seedClos.map((l, i) => [`CLO-${i + 1}`, l.statement, l.bloomLevel, l.mappedPlo ? `PLO-${l.mappedPlo.number}` : ""])); }
    if (k.seedTopics.length) { pdf.h2("Topics, week by week"); pdf.table([["Week", 9], ["Lecture", 10], ["Topic", 81]], k.seedTopics.map((t) => [Math.ceil(Number(t.lectureNumber) / 2), Number(t.lectureNumber), t.topic + ((t as { subtopic?: string | null }).subtopic ? ` — ${(t as { subtopic?: string | null }).subtopic}` : "")])); }
    if (k.textbook) { pdf.h2("Textbook"); pdf.text(k.textbook); }
    if (k.referenceMaterial) { pdf.h2("Reference material"); pdf.text(k.referenceMaterial); }
  }
  // Matrix
  pdf.newPage(); pdf.h1("Course–PLO matrix");
  const nums = c.plos.map((x) => x.number);
  pdf.table([["Course", 22], ...nums.map((n) => [`P${n}`, Math.max(4, Math.floor(78 / Math.max(1, nums.length)))] as [string, number])], c.courses.map((k) => { const ps = coursePlos(k); return [k.code, ...nums.map((n) => (ps.includes(n) ? "X" : ""))]; }), { size: 7.5 });
  return Buffer.from(await pdf.save());
}
