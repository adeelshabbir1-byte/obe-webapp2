import { randomUUID } from "crypto";
import { prisma } from "./db";
import { colOf, get, readSheets, type Sheet } from "./masterFullImport";

// The full curriculum template's other sheets (Adeel prompt §17), matched by header name:
//   Courses: Lab CH · Lecture topics: Importance · PR · Book chapter · Topic links · Lab plan · Assessment plan · Questions · Rubrics.
// preview (dryRun) checks every row and reports per sheet: rows OK, rows with problems (those rows are skipped; the rest
// import). A course code not in the curriculum is refused, never created. Re-importing updates instead of duplicating.
const db = prisma as unknown as Record<string, any>;
const up = (s?: string) => (s || "").trim().toUpperCase();
const BLOOM = /^(C[1-6]|P[1-5]|A[1-5])$/;
export type SheetReport = { sheet: string; ok: number; problems: string[] };

async function context(curriculumId: string) {
  const [courses, plos] = await Promise.all([
    prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, code: true, seedClos: { select: { bloomLevel: true }, orderBy: { orderIndex: "asc" } } } }),
    prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { number: true } }),
  ]);
  return { byCode: new Map(courses.map((c) => [up(c.code), c])), plos: new Set(plos.map((p) => p.number)) };
}
const cloNo = (s: string) => { const n = parseInt(s.replace(/\D+/g, ""), 10); return Number.isFinite(n) && n > 0 ? n : null; };

export async function importExtras(curriculumId: string, sheets: Map<string, Sheet>, dryRun: boolean) {
  const ctx = await context(curriculumId);
  const reports: SheetReport[] = [];
  const course = (code: string, rep: SheetReport, where: string) => { const c = ctx.byCode.get(up(code)); if (!c) { rep.problems.push(`${where}: course ${code || "(blank)"} is not in this curriculum`); return null; } return c; };
  const cloOk = (c: { seedClos: unknown[] }, n: number | null) => n != null && n <= c.seedClos.length;
  const write = async (fn: () => Promise<unknown>) => { if (!dryRun) await fn(); };

  // Courses: Lab CH
  const cs = sheets.get("courses");
  if (cs && colOf(cs, /^lab ch$/) >= 0) {
    const rep: SheetReport = { sheet: "Courses (Lab CH)", ok: 0, problems: [] };
    const cC = colOf(cs, /^code$/), cL = colOf(cs, /^lab ch$/);
    for (const r of cs.rows) {
      const code = get(r, cC); if (!code) continue;
      const c = ctx.byCode.get(up(code)); if (!c) continue; // created by the main import
      const lab = parseInt(get(r, cL), 10) || 0;
      if (lab === 1 && c.seedClos.length && !c.seedClos.some((x) => /^P/i.test(String(x.bloomLevel)))) rep.problems.push(`${code}: Lab CH = 1 but no P-level (psychomotor) CLO`);
      await write(() => db.masterCourseLab?.upsert({ where: { masterCourseId: c.id }, create: { masterCourseId: c.id, labCredits: lab }, update: { labCredits: lab } }));
      rep.ok++;
    }
    reports.push(rep);
  }

  // Lecture topics: Importance · PR · Book chapter (and lecture / CLO checks)
  const tp = sheets.get("lecture topics");
  if (tp) {
    const rep: SheetReport = { sheet: "Lecture topics", ok: 0, problems: [] };
    const c = { code: colOf(tp, /^course code$/), lec: colOf(tp, /^lecture$/), clo: colOf(tp, /^(mapped )?clo$/), imp: colOf(tp, /^importance$/), pr: colOf(tp, /^pr$/), ch: colOf(tp, /^book chapter$/) };
    const meta = new Map<string, Record<number, { importance: string | null; pr: boolean; chapter: string | null }>>();
    const seen = new Set<string>();
    for (const r of tp.rows) {
      const code = get(r, c.code); if (!code) continue;
      const mc = course(code, rep, "Lecture topics"); if (!mc) continue;
      const lec = parseInt(get(r, c.lec), 10);
      if (!Number.isFinite(lec) || lec < 1 || lec > 32) { rep.problems.push(`${code} L${get(r, c.lec)}: lecture must be 1–32`); continue; }
      if (seen.has(`${mc.id}|${lec}`)) { rep.problems.push(`${code} L${lec}: lecture number appears twice`); continue; }
      seen.add(`${mc.id}|${lec}`);
      const n = cloNo(get(r, c.clo));
      if (get(r, c.clo) && !cloOk(mc, n)) { rep.problems.push(`${code} L${lec}: ${get(r, c.clo)} does not exist`); continue; }
      const imp = get(r, c.imp);
      if (imp && !/^(core|important|optional)$/i.test(imp)) { rep.problems.push(`${code} L${lec}: Importance must be Core / Important / Optional`); continue; }
      const m = meta.get(mc.id) || {};
      m[lec] = { importance: imp ? imp[0].toUpperCase() + imp.slice(1).toLowerCase() : null, pr: /^y/i.test(get(r, c.pr)), chapter: get(r, c.ch) || null };
      meta.set(mc.id, m); rep.ok++;
    }
    for (const [id, m] of Array.from(meta.entries())) await write(() => db.masterCourseExtra.upsert({ where: { masterCourseId_kind: { masterCourseId: id, kind: "topicMeta" } }, create: { masterCourseId: id, kind: "topicMeta", dataJson: JSON.stringify(m) }, update: { dataJson: JSON.stringify(m), updatedAt: new Date() } }));
    reports.push(rep);
  }

  // Topic links
  const tl = sheets.get("topic links");
  if (tl) {
    const rep: SheetReport = { sheet: "Topic links", ok: 0, problems: [] };
    const c = { code: colOf(tl, /^course code$/), lec: colOf(tl, /^lecture$/), on: colOf(tl, /^needs course code$/), onLec: colOf(tl, /^needs lecture$/) };
    const rows: { masterCourseId: string; lectureNumber: number; onCourseId: string; onLecture: number }[] = [];
    for (const r of tl.rows) {
      const code = get(r, c.code); if (!code) continue;
      const a = course(code, rep, "Topic links"), b = course(get(r, c.on), rep, "Topic links");
      const l1 = parseInt(get(r, c.lec), 10), l2 = parseInt(get(r, c.onLec), 10);
      if (!a || !b) continue;
      if (!Number.isFinite(l1) || !Number.isFinite(l2)) { rep.problems.push(`${code}: lecture numbers missing`); continue; }
      rows.push({ masterCourseId: a.id, lectureNumber: l1, onCourseId: b.id, onLecture: l2 }); rep.ok++;
    }
    const ids = Array.from(new Set(rows.map((x) => x.masterCourseId)));
    await write(async () => { if (ids.length) { await db.masterTopicDep.deleteMany({ where: { masterCourseId: { in: ids } } }); await db.masterTopicDep.createMany({ data: rows.map((x) => ({ id: randomUUID(), ...x })) }); } });
    reports.push(rep);
  }

  // Lab plan
  const lp = sheets.get("lab plan");
  if (lp) {
    const rep: SheetReport = { sheet: "Lab plan", ok: 0, problems: [] };
    const c = { code: colOf(lp, /^course code$/), wk: colOf(lp, /^week$/), no: colOf(lp, /^lab no$/), ex: colOf(lp, /^experiment/), th: colOf(lp, /^theory lecture$/), clo: colOf(lp, /^lab clo$/), tool: colOf(lp, /^tools/), del: colOf(lp, /^deliverable$/) };
    const by = new Map<string, { week: number; labNo: string; experiment: string; theoryLecture: number | null; clo: string; tools: string; deliverable: string }[]>();
    for (const r of lp.rows) {
      const code = get(r, c.code); if (!code) continue;
      const mc = course(code, rep, "Lab plan"); if (!mc) continue;
      const wk = parseInt(get(r, c.wk), 10), ex = get(r, c.ex);
      if (!Number.isFinite(wk) || wk < 1 || !ex) { rep.problems.push(`${code}: a lab row needs a week and an experiment`); continue; }
      const th = parseInt(get(r, c.th), 10);
      if (Number.isFinite(th) && th > 2 * wk) rep.problems.push(`${code} week ${wk}: practises lecture ${th}, taught later (warning only)`);
      by.set(mc.id, [...(by.get(mc.id) || []), { week: wk, labNo: get(r, c.no), experiment: ex, theoryLecture: Number.isFinite(th) ? th : null, clo: get(r, c.clo), tools: get(r, c.tool), deliverable: get(r, c.del) }]);
      rep.ok++;
    }
    for (const [id, rows] of Array.from(by.entries())) await write(async () => {
      await db.masterLabPlan.deleteMany({ where: { masterCourseId: id } });
      const uniq = new Map(rows.map((x) => [x.week, x]));
      await db.masterLabPlan.createMany({ data: Array.from(uniq.values()).map((x) => ({ masterCourseId: id, week: x.week, experiment: x.experiment })) });
      await db.masterCourseExtra.upsert({ where: { masterCourseId_kind: { masterCourseId: id, kind: "labPlan" } }, create: { masterCourseId: id, kind: "labPlan", dataJson: JSON.stringify(rows) }, update: { dataJson: JSON.stringify(rows), updatedAt: new Date() } });
    });
    reports.push(rep);
  }

  // Assessment plan (weights total 100 per course)
  const ap = sheets.get("assessment plan");
  if (ap) {
    const rep: SheetReport = { sheet: "Assessment plan", ok: 0, problems: [] };
    const c = { code: colOf(ap, /^course code$/), as: colOf(ap, /^assessment$/), part: colOf(ap, /^part/), n: colOf(ap, /^count$/), w: colOf(ap, /^weight/), lec: colOf(ap, /^lectures covered$/), clos: colOf(ap, /^clos$/), note: colOf(ap, /^notes?$/) };
    const by = new Map<string, Record<string, unknown>[]>();
    for (const r of ap.rows) {
      const code = get(r, c.code); if (!code) continue;
      const mc = course(code, rep, "Assessment plan"); if (!mc) continue;
      by.set(mc.id, [...(by.get(mc.id) || []), { type: get(r, c.as), part: get(r, c.part) || "Theory", count: parseInt(get(r, c.n), 10) || 1, weight: parseFloat(get(r, c.w)) || 0, lectures: get(r, c.lec), clos: get(r, c.clos), note: get(r, c.note) }]);
      rep.ok++;
    }
    for (const [id, items] of Array.from(by.entries())) {
      const total = items.reduce((a, x) => a + Number(x.weight || 0), 0);
      const code = Array.from(ctx.byCode.values()).find((x) => x.id === id)?.code;
      if (Math.round(total) !== 100) { rep.problems.push(`${code}: weights total ${total}, not 100 — not imported`); continue; }
      await write(() => db.masterCourseAssessment.upsert({ where: { masterCourseId: id }, create: { masterCourseId: id, itemsJson: JSON.stringify(items) }, update: { itemsJson: JSON.stringify(items), updatedAt: new Date() } }));
    }
    reports.push(rep);
  }

  // Questions (go to the course's question bank as Draft when the SE loads the content) and rubrics
  for (const [name, kind] of [["questions", "questions"], ["rubrics", "rubrics"]] as const) {
    const sh = sheets.get(name);
    if (!sh) continue;
    const rep: SheetReport = { sheet: name === "questions" ? "Questions" : "Rubrics", ok: 0, problems: [] };
    const cc = colOf(sh, /^course code$/);
    const by = new Map<string, Record<string, string>[]>();
    for (const r of sh.rows) {
      const code = get(r, cc); if (!code) continue;
      const mc = course(code, rep, rep.sheet); if (!mc) continue;
      const row: Record<string, string> = {}; sh.headers.forEach((h, i) => { row[h] = get(r, i); });
      const n = cloNo(row["clo"] || "");
      if (kind === "questions") {
        if (row["bloom level"] && !BLOOM.test(up(row["bloom level"]).replace(/\s+/g, ""))) { rep.problems.push(`${code} Q${row["q no"]}: Bloom level must be C1–C6 / P1–P5 / A1–A5`); continue; }
        if (/^(midterm|final)$/i.test(row["used in"] || "") && !n) { rep.problems.push(`${code} Q${row["q no"]}: a ${row["used in"]} question needs a CLO`); continue; }
      }
      if (row["clo"] && !cloOk(mc, n)) { rep.problems.push(`${code}: ${row["clo"]} is not one of this course's CLOs`); continue; }
      by.set(mc.id, [...(by.get(mc.id) || []), row]); rep.ok++;
    }
    for (const [id, rows] of Array.from(by.entries())) await write(() => db.masterCourseExtra.upsert({ where: { masterCourseId_kind: { masterCourseId: id, kind } }, create: { masterCourseId: id, kind, dataJson: JSON.stringify(rows) }, update: { dataJson: JSON.stringify(rows), updatedAt: new Date() } }));
    reports.push(rep);
  }

  // GA references in the CLO sheet
  const cl = sheets.get("clos and plo mapping");
  if (cl) {
    const rep: SheetReport = { sheet: "CLOs and PLO mapping", ok: 0, problems: [] };
    const cC = colOf(cl, /^course code$/), cP = colOf(cl, /^(mapped )?plo$/), cB = colOf(cl, /^bloom/);
    for (const r of cl.rows) {
      const code = get(r, cC); if (!code) continue;
      if (!ctx.byCode.get(up(code)) && dryRun) { rep.problems.push(`CLO of ${code}: course not in this curriculum`); continue; }
      const n = cloNo(get(r, cP));
      if (get(r, cP) && (n == null || (ctx.plos.size && !ctx.plos.has(n)))) { rep.problems.push(`${code}: ${get(r, cP)} is not a GA of this curriculum`); continue; }
      if (get(r, cB) && !BLOOM.test(up(get(r, cB)).replace(/\s+/g, ""))) { rep.problems.push(`${code}: Bloom level ${get(r, cB)} must be C1–C6 / P1–P5 / A1–A5`); continue; }
      rep.ok++;
    }
    reports.unshift(rep);
  }
  return { sheets: reports.map((r) => ({ ...r, problems: r.problems.slice(0, 30), problemCount: r.problems.length })) };
}

/** Preview of a whole template file: per-sheet rows OK and problems, nothing written. */
export async function previewTemplate(curriculumId: string, file: File) {
  return importExtras(curriculumId, await readSheets(file), true);
}
