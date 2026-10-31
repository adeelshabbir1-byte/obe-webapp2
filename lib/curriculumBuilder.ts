import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { findOwningChairmanId } from "./institutionCurriculum";
import { TEMPLATES, KINDS, kindInfo, autoPlace, normTitle, parseReq, reqPresent, type Kind } from "./curriculumTemplates";
import { saveMeta, propose } from "./curriculumLibrary";
import { fillContent, hasContentPack } from "./curriculumContent";
import { fillShared, exchangeAll } from "./curriculumShare";

// Curriculum Builder: who may build, the board's data, and every change made on it. A curriculum is built in four
// steps — its types (categories with targets), placing courses into them, sorting the elective list into tracks,
// review and publish. Official curricula are built by the Super User or a Curriculum Builder (a curriculum committee
// member with a scope); a university builds its own.

export const bdb = prisma as unknown as Record<string, any>;
export const BUILDER_HINT = "The Curriculum Builder needs prisma/migration_curriculum_builder.sql — run it in Supabase (or System Health).";
type U = { id: string; role: string };

export async function builderScope(userId: string) {
  const r = (await bdb.curriculumBuilderScope.findUnique({ where: { userId } }).catch(() => null)) as { councilsJson: string; programsJson: string } | null;
  if (!r) { const t = await (await import("./platformTeam")).teamScope(userId); return t ? { councils: t.councils, programs: t.programs } : null; }
  const p = (s: string) => { try { return JSON.parse(s) as string[]; } catch { return []; } };
  return { councils: p(r.councilsJson), programs: p(r.programsJson) };
}
/** May this person build (or change) this curriculum? Without one: may they start new curricula at all? */
export async function canBuild(user: U, c?: { chairmanId: string | null; authority: string; title: string } | null) {
  if (user.role === "SUPER_USER") return true;
  const sc = await builderScope(user.id);
  if (!c) return !!sc || ["CHAIRMAN", "DEAN", "OMC"].includes(user.role);
  if (c.chairmanId === null) return !!sc && (!sc.councils.length || sc.councils.includes(c.authority)) && (!sc.programs.length || sc.programs.some((p) => normTitle(c.title).includes(normTitle(p))));
  return ["CHAIRMAN", "DEAN", "OMC"].includes(user.role) && (await findOwningChairmanId(user.id)) === c.chairmanId;
}

export type BType = { id: string; name: string; kind: Kind; minCourses: number | null; minCredits: number | null; maxCredits: number | null; required: string[]; note: string | null; position: number; prefilled: boolean };
export type BCourse = { id: string; code: string; title: string; creditHours: number; lab: number; semesterNumber: number | null; category: string; prerequisite: string | null; tracks: string[]; adopted: number; clos: number; lectures: number; mappedClos: number; from: string | null; fromOtherEdition: boolean; outline: string; textbook: string; references: string };
export type BTrack = { id: string; name: string; minCourses: number | null; position: number };

export async function loadBoard(id: string) {
  const c = await prisma.masterCurriculum.findUnique({ where: { id }, select: { id: true, title: true, version: true, authority: true, status: true, chairmanId: true, sourceReference: true, courses: { select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, category: true, catalogDescription: true, textbook: true, referenceMaterial: true, prerequisiteCourse: { select: { code: true } }, _count: { select: { adoptedInto: true, seedClos: true, seedTopics: true } }, seedClos: { where: { mappedPloId: { not: null } }, select: { id: true } } } }, _count: { select: { plos: true } } } });
  if (!c) return null;
  const [types, tracks] = await Promise.all([
    bdb.curriculumType.findMany({ where: { curriculumId: id }, orderBy: { position: "asc" } }) as Promise<(Omit<BType, "required"> & { requiredJson: string })[]>,
    bdb.curriculumTrack.findMany({ where: { curriculumId: id }, orderBy: { position: "asc" } }) as Promise<BTrack[]>,
  ]);
  const links = (await bdb.masterCourseTrack.findMany({ where: { masterCourseId: { in: c.courses.map((x) => x.id).concat("none") } } })) as { masterCourseId: string; trackId: string }[];
  const labs = new Map(((await bdb.masterCourseLab.findMany({ where: { masterCourseId: { in: c.courses.map((x) => x.id).concat("none") } } }).catch(() => [])) as { masterCourseId: string; labCredits: number }[]).map((l) => [l.masterCourseId, l.labCredits]));
  const srcs = new Map(((await bdb.masterCourseSource.findMany({ where: { masterCourseId: { in: c.courses.map((x) => x.id).concat("none") } } }).catch(() => [])) as { masterCourseId: string; fromLabel: string; sameEdition: boolean }[]).map((s) => [s.masterCourseId, s]));
  const owner = c.chairmanId ? await prisma.user.findUnique({ where: { id: c.chairmanId }, select: { instituteName: true, name: true } }) : null;
  return {
    curriculum: { id: c.id, title: c.title, version: c.version, authority: c.authority, status: c.status, chairmanId: c.chairmanId, owner: owner?.instituteName || owner?.name || null, reference: c.sourceReference, plos: c._count.plos },
    types: types.map((t) => ({ ...t, required: (() => { try { return JSON.parse(t.requiredJson) as string[]; } catch { return []; } })() })) as BType[],
    tracks,
    courses: c.courses.map((x) => ({ id: x.id, code: x.code, title: x.title, creditHours: x.creditHours, lab: labs.get(x.id) || 0, semesterNumber: x.semesterNumber, category: x.category, prerequisite: x.prerequisiteCourse?.code || null, tracks: links.filter((l) => l.masterCourseId === x.id).map((l) => l.trackId), adopted: x._count.adoptedInto, clos: x._count.seedClos, lectures: x._count.seedTopics, mappedClos: x.seedClos.length, from: srcs.get(x.id)?.fromLabel || null, fromOtherEdition: srcs.get(x.id) ? !srcs.get(x.id)!.sameEdition : false, outline: x.catalogDescription || "", textbook: x.textbook || "", references: x.referenceMaterial || "" })) as BCourse[],
  };
}

async function writeTypes(curriculumId: string, types: { name: string; kind: Kind; minCourses?: number | null; minCredits?: number | null; maxCredits?: number | null; required?: string[]; note?: string | null }[], prefilled: boolean) {
  await bdb.curriculumType.deleteMany({ where: { curriculumId } });
  for (const [i, t] of types.entries()) await bdb.curriculumType.create({ data: { id: randomUUID(), curriculumId, name: t.name.trim().slice(0, 60), kind: t.kind, minCourses: t.minCourses ?? null, minCredits: t.minCredits ?? null, maxCredits: t.maxCredits ?? null, requiredJson: JSON.stringify((t.required || []).map((r) => r.trim()).filter(Boolean).slice(0, 60)), note: t.note || null, position: i, prefilled } });
}

/** Put every course into a type (only courses whose category is not already one of the types, unless all = true). */
export async function autoPlaceAll(curriculumId: string, all = false) {
  const b = await loadBoard(curriculumId);
  if (!b || !b.types.length) return 0;
  const names = new Set(b.types.map((t) => t.name));
  let n = 0;
  for (const c of b.courses) {
    if (!all && names.has(c.category)) continue;
    const to = autoPlace(c, b.types);
    if (to && to !== c.category) { await prisma.masterCourse.update({ where: { id: c.id }, data: { category: to } }); n++; }
  }
  return n;
}

const SHORT: Record<string, string> = { GE: "GE", CORE: "CC", SUPPORTING: "MS", LAB: "LB", IDS: "ES", ELECTIVE_SLOT: "DE", ELECTIVE_LIST: "EL", IDS_LIST: "IL", CAPSTONE: "CP", INTERNSHIP: "IN", NONCREDIT: "NC" };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
/** Create the template's courses: every required course with its credit hours and lab part, and the elective slots. */
async function seedCourses(curriculumId: string, types: { name: string; kind: Kind; minCourses?: number | null; minCredits?: number | null; required?: string[] }[]) {
  const used = new Set<string>(); let domainCore = 0;
  for (const t of types) {
    let n = 0; const pre = t.kind === "CORE" && domainCore++ > 0 ? "DC" : SHORT[t.kind] || "CR";
    const make = async (title: string, ch: number, lab: number) => {
      let code = ""; do { code = `${pre}-${String(++n).padStart(2, "0")}`; } while (used.has(code)); used.add(code);
      const mc = await prisma.masterCourse.create({ data: { masterCurriculumId: curriculumId, code, title, creditHours: ch, category: t.name } });
      if (lab > 0) await bdb.masterCourseLab.create({ data: { masterCourseId: mc.id, labCredits: lab } }).catch(() => null);
    };
    for (const r of t.required || []) { const q = parseReq(r); await make(q.title, q.ch ?? 3, q.lab ?? 0); }
    // Slots for the rest: Elective I–VIII, or IDS III–IV after the named IDS courses.
    if (t.kind === "ELECTIVE_SLOT" || t.kind === "IDS") {
      const req = (t.required || []).map((r) => parseReq(r));
      const left = (t.minCourses || 0) - req.length, chLeft = (t.minCredits || 0) - req.reduce((a, r) => a + (r.ch || 0), 0);
      for (let i = 0; i < left; i++) await make(`${t.name.replace(/ \/.*$/, "")} ${ROMAN[req.length + i] || req.length + i + 1}`, Math.max(1, Math.round(chLeft / left)), 0);
    }
  }
}

/** Start a curriculum: from a template (types only), from an existing curriculum (its courses copied), or both. */
export async function startCurriculum(user: U, o: { program: string; council: string; version: string; templateKey?: string; sourceId?: string }) {
  const tpl = TEMPLATES.find((t) => t.key === o.templateKey) || null;
  const src = o.sourceId ? await prisma.masterCurriculum.findUnique({ where: { id: o.sourceId }, include: { courses: { include: { seedClos: { orderBy: { orderIndex: "asc" } }, seedTopics: true } }, plos: true } }) : null;
  const chairmanId = user.role === "SUPER_USER" || (await builderScope(user.id)) ? null : await findOwningChairmanId(user.id);
  if (!(await canBuild(user, { chairmanId, authority: o.council, title: o.program }))) throw new Error("You may not build curricula for this council or program.");
  const title = o.program.trim().slice(0, 120), version = (o.version.trim() || String(new Date().getFullYear())).slice(0, 40);
  if (await prisma.masterCurriculum.findFirst({ where: { title, version, authority: o.council, chairmanId } })) throw new Error(`${o.council} ${title} ${version} already exists — open it from the list.`);
  const c = await prisma.masterCurriculum.create({ data: { authority: o.council.slice(0, 20), title, version, status: "DRAFT", degreeProgram: title, chairmanId, parentCurriculumId: src?.id || null, sourceReference: src?.sourceReference || null } });
  if (src) {
    // PLOs first, so the copied CLOs keep their PLO mapping (by PLO number). A copy of an HEC curriculum (the Golden
    // Copy) carries its CLOs and lecture topics too — it starts 100% aligned.
    const ploNo = new Map(src.plos.map((p) => [p.id, p.number]));
    const ploId = new Map<number, string>();
    for (const p of src.plos) { const np = await prisma.masterPLO.create({ data: { masterCurriculumId: c.id, number: p.number, title: p.title, description: p.description } as never }).catch(() => null) as { id: string } | null; if (np) ploId.set(p.number, np.id); }
    for (const mc of src.courses) {
      const n = await prisma.masterCourse.create({ data: { masterCurriculumId: c.id, code: mc.code, title: mc.title, creditHours: mc.creditHours, category: mc.category, domain: mc.domain, semesterNumber: mc.semesterNumber, textbook: mc.textbook, catalogDescription: mc.catalogDescription, referenceMaterial: mc.referenceMaterial } });
      if (mc.seedClos.length) await prisma.masterCourseClo.createMany({ data: mc.seedClos.map((x) => ({ masterCourseId: n.id, statement: x.statement, bloomLevel: x.bloomLevel, orderIndex: x.orderIndex, mappedPloId: x.mappedPloId ? ploId.get(ploNo.get(x.mappedPloId) ?? -1) ?? null : null, ploMappingSource: x.ploMappingSource })) });
      if (mc.seedTopics.length) await prisma.masterCourseTopic.createMany({ data: mc.seedTopics.map((x) => ({ masterCourseId: n.id, lectureNumber: x.lectureNumber, topic: x.topic, subtopic: x.subtopic, cloNumber: x.cloNumber })), skipDuplicates: true });
    }
  }
  if (tpl) {
    await writeTypes(c.id, tpl.types, true);
    if (!src) await seedCourses(c.id, tpl.types);
    const trackIds = new Map<string, string>();
    for (const [i, name] of tpl.tracks.entries()) { const tid = randomUUID(); trackIds.set(name, tid); await bdb.curriculumTrack.create({ data: { id: tid, curriculumId: c.id, name, position: i } }); }
    // Track electives: one course per title in the elective list, linked to every track that lists it.
    const list = tpl.types.find((t) => t.kind === "ELECTIVE_LIST");
    if (!src && list && tpl.trackCourses) {
      const byTitle = new Map<string, string>(); let n = 0;
      for (const [track, items] of Object.entries(tpl.trackCourses)) {
        const tid = trackIds.get(track); if (!tid) continue;
        for (const it of items) {
          const q = parseReq(it), k = normTitle(q.title);
          let id = byTitle.get(k);
          if (!id) {
            const mc = await prisma.masterCourse.create({ data: { masterCurriculumId: c.id, code: `EL-${String(++n).padStart(3, "0")}`, title: q.title, creditHours: q.ch ?? 3, category: list.name } });
            if (q.lab) await bdb.masterCourseLab.create({ data: { masterCourseId: mc.id, labCredits: q.lab } }).catch(() => null);
            id = mc.id as string; byTitle.set(k, id);
          }
          await bdb.masterCourseTrack.create({ data: { masterCourseId: id, trackId: tid } }).catch(() => null);
        }
      }
    }
    if (src) await autoPlaceAll(c.id, true); // a copied curriculum's courses are sorted into the template's types
    if (hasContentPack(tpl.key)) await fillContent(c.id, tpl.key, tpl.types); // semesters, PLOs, CLOs, lecture plans
  }
  const p = propose({ ...c, chairmanId }, null);
  await saveMeta(c.id, user.id, { code: tpl?.key && !src ? tpl.key.replace(/-\d{4}$/, `-${version.match(/\d{4}/)?.[0] || version}`) : p.code, level: p.level, programCode: p.programCode, programName: p.programName, discipline: p.discipline }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "CURRICULUM_STARTED", entityType: "MasterCurriculum", entityId: c.id, metadata: { template: tpl?.key || null, source: src?.id || null } });
  return c.id;
}

export function checks(b: NonNullable<Awaited<ReturnType<typeof loadBoard>>>) {
  const per = b.types.map((t) => {
    const cs = b.courses.filter((c) => c.category === t.name);
    const ch = cs.reduce((s, c) => s + c.creditHours, 0);
    const missing = t.required.filter((r) => !reqPresent(r, cs.map((c) => c.title)));
    const counts = kindInfo(t.kind).counts;
    const okCh = !counts || ((t.minCredits == null || ch >= t.minCredits) && (t.maxCredits == null || ch <= t.maxCredits));
    const okN = t.minCourses == null || cs.length >= t.minCourses;
    return { id: t.id, name: t.name, courses: cs.length, credits: ch, missing, ok: okCh && okN && !missing.length };
  });
  const total = b.types.filter((t) => kindInfo(t.kind).counts).reduce((s, t) => s + (per.find((p) => p.id === t.id)?.credits || 0), 0);
  const unplaced = b.courses.filter((c) => !b.types.some((t) => t.name === c.category));
  const slots = b.types.filter((t) => t.kind === "ELECTIVE_SLOT").reduce((s, t) => s + (per.find((p) => p.id === t.id)?.courses || 0), 0);
  const listT = b.types.find((t) => t.kind === "ELECTIVE_LIST");
  const list = listT ? b.courses.filter((c) => c.category === listT.name) : [];
  const tracks = b.tracks.map((tr) => ({ id: tr.id, name: tr.name, courses: list.filter((c) => c.tracks.includes(tr.id)).length, need: tr.minCourses ?? slots }));
  // Master-copy coverage: every counted course needs a semester, CLOs mapped to PLOs and a lecture plan; list courses need CLOs.
  const countedNames = new Set(b.types.filter((t) => kindInfo(t.kind).counts).map((t) => t.name));
  const counted = b.courses.filter((c) => countedNames.has(c.category));
  const slotNames = new Set(b.types.filter((t) => t.kind === "ELECTIVE_SLOT" || t.kind === "INTERNSHIP" || t.kind === "NONCREDIT").map((t) => t.name));
  const content = counted.filter((c) => !slotNames.has(c.category) && !/certification/i.test(c.title)); // slots take the chosen elective's content
  const coverage = {
    plos: b.curriculum.plos,
    noSemester: counted.filter((c) => c.semesterNumber == null).map((c) => c.title),
    noClos: content.filter((c) => !c.clos).map((c) => c.title),
    unmapped: b.courses.filter((c) => c.clos > c.mappedClos).map((c) => c.title),
    noLectures: content.filter((c) => c.lectures < 32).map((c) => c.title),
    listNoClos: list.filter((c) => !c.clos).map((c) => c.title),
    listNoLectures: list.filter((c) => c.lectures < 32).length,
  };
  return { coverage, per, total, unplaced: unplaced.length, ready: per.every((p) => p.ok) && !unplaced.length && total >= 120 && total <= 144, slots, listCount: list.length, untracked: list.filter((c) => !c.tracks.length).length, tracks };
}

/** Every change on the board. Returns a short message. */
export async function act(user: U, curriculumId: string, a: Record<string, unknown>) {
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { id: true, chairmanId: true, authority: true, title: true, status: true, version: true } });
  if (!c) throw new Error("Not found.");
  if (!(await canBuild(user, c))) throw new Error("You may not change this curriculum.");
  const s = (k: string, n = 200) => String(a[k] ?? "").trim().slice(0, n);
  const num = (k: string) => (a[k] === "" || a[k] == null ? null : Math.max(0, Math.round(Number(a[k]))) || null);
  const course = async () => { const x = await prisma.masterCourse.findFirst({ where: { id: s("courseId"), masterCurriculumId: c.id } }); if (!x) throw new Error("Course not found."); return x; };
  switch (a.action) {
    case "fillShared": return fillShared(user.id, c.id);
    case "exchangeAll": if (user.role !== "SUPER_USER") throw new Error("Only the Super Admin runs this across the library."); return exchangeAll(user.id);
    case "fillContent": {
      const key = s("pack", 60);
      const types = (await bdb.curriculumType.findMany({ where: { curriculumId: c.id } })) as { name: string; kind: string }[];
      const d = await fillContent(c.id, key, types);
      return `Filled ${d.courses} courses: ${d.semesters} semesters, ${d.plos} PLOs, ${d.clos} CLOs, ${d.lectures} lectures${d.details ? `, ${d.details} outlines/codes` : ""}. Nothing already entered was changed.`;
    }
    case "place": { await course(); await prisma.masterCourse.update({ where: { id: s("courseId") }, data: { category: s("type", 60) } }); return "Moved."; }
    case "updateCourse": {
      const x = await course();
      { const why = await (await import("./goldenCopy")).guardCourse(x.id, { code: a.code !== undefined ? String(a.code) : undefined, title: a.title !== undefined ? String(a.title) : undefined, creditHours: a.creditHours !== undefined ? Number(a.creditHours) : undefined }); if (why) throw new Error(why); }
      const data: Record<string, unknown> = {};
      if (a.code !== undefined) { const code = s("code", 20).toUpperCase(); if (!code) throw new Error("A course needs a code."); if (code !== x.code && (await prisma.masterCourse.findFirst({ where: { masterCurriculumId: c.id, code } }))) throw new Error(`${code} is already used in this curriculum.`); data.code = code; }
      if (a.title !== undefined) { if (!s("title")) throw new Error("A course needs a title."); data.title = s("title"); }
      if (a.creditHours !== undefined) { const ch = Number(a.creditHours); if (!Number.isInteger(ch) || ch < 0 || ch > 12) throw new Error("Credit hours must be 0–12."); data.creditHours = ch; }
      if (a.outline !== undefined) data.catalogDescription = String(a.outline || "").slice(0, 20000) || null;
      if (a.textbook !== undefined) data.textbook = String(a.textbook || "").slice(0, 1000) || null;
      if (a.references !== undefined) data.referenceMaterial = String(a.references || "").slice(0, 5000) || null;
      if (a.semesterNumber !== undefined) { const sm = a.semesterNumber === "" || a.semesterNumber === null ? null : Number(a.semesterNumber); if (sm !== null && (!Number.isInteger(sm) || sm < 1 || sm > 12)) throw new Error("Semester must be 1–12."); data.semesterNumber = sm; }
      await prisma.masterCourse.update({ where: { id: x.id }, data });
      if (a.lab !== undefined) { const lab = Math.max(0, Math.round(Number(a.lab) || 0)); if (lab > Number(data.creditHours ?? x.creditHours)) throw new Error("The lab part can't be more than the credit hours."); await bdb.masterCourseLab.upsert({ where: { masterCourseId: x.id }, create: { masterCourseId: x.id, labCredits: lab }, update: { labCredits: lab } }); }
      return "Saved.";
    }
    case "addCourse": {
      const rq = parseReq(s("title"));
      if (rq.ch != null && a.creditHours === undefined) { a.creditHours = rq.ch; a.lab = rq.lab ?? 0; }
      const title = rq.title; if (!title) throw new Error("Give the course a title.");
      let code = s("code", 20).toUpperCase();
      if (!code) { const n = await prisma.masterCourse.count({ where: { masterCurriculumId: c.id } }); code = `NEW-${String(n + 1).padStart(3, "0")}`; }
      if (await prisma.masterCourse.findFirst({ where: { masterCurriculumId: c.id, code } })) throw new Error(`${code} is already used in this curriculum.`);
      const ch = Number(a.creditHours ?? 3);
      const made = await prisma.masterCourse.create({ data: { masterCurriculumId: c.id, code, title, creditHours: Number.isInteger(ch) && ch >= 0 && ch <= 12 ? ch : 3, category: s("type", 60) || "Unplaced", semesterNumber: num("semesterNumber") } });
      if (Number(a.lab) > 0) await bdb.masterCourseLab.upsert({ where: { masterCourseId: made.id }, create: { masterCourseId: made.id, labCredits: Number(a.lab) }, update: { labCredits: Number(a.lab) } });
      return `${title} added.`;
    }
    case "removeCourse": {
      const x = await course();
      { const why = await (await import("./goldenCopy")).guardCourse(x.id, { remove: true }); if (why) throw new Error(why); }
      if (await prisma.course.count({ where: { masterCourseId: x.id } })) throw new Error("Batches already use this course; it can't be removed (move it, or start a new version).");
      await bdb.masterCourseTrack.deleteMany({ where: { masterCourseId: x.id } });
      await prisma.masterCourse.delete({ where: { id: x.id } }).catch(() => { throw new Error("This course has CLOs or topics; remove them in the full editor first."); });
      return "Removed.";
    }
    case "saveTypes": {
      const rows = Array.isArray(a.types) ? (a.types as Record<string, unknown>[]) : [];
      if (!rows.length) throw new Error("Add at least one type.");
      const names = rows.map((r) => String(r.name || "").trim());
      if (names.some((n) => !n)) throw new Error("Every type needs a name.");
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new Error("Two types have the same name.");
      const old = (await bdb.curriculumType.findMany({ where: { curriculumId: c.id } })) as { id: string; name: string }[];
      // A renamed type takes its courses with it.
      for (const r of rows) { const prev = old.find((o) => o.id === r.id); if (prev && prev.name !== String(r.name).trim()) await prisma.masterCourse.updateMany({ where: { masterCurriculumId: c.id, category: prev.name }, data: { category: String(r.name).trim() } }); }
      const n = (v: unknown) => (v === "" || v == null ? null : Math.max(0, Math.round(Number(v))));
      await writeTypes(c.id, rows.map((r) => ({ name: String(r.name), kind: (KINDS.some((k) => k.kind === r.kind) ? r.kind : "CORE") as Kind, minCourses: n(r.minCourses), minCredits: n(r.minCredits), maxCredits: n(r.maxCredits), required: Array.isArray(r.required) ? (r.required as string[]) : String(r.required || "").split(/\n|;/), note: r.note ? String(r.note) : null })), false);
      return "Types saved.";
    }
    case "typeRule": { // pass / fail only, and only for one student track (e.g. Math Deficiency for Pre-Medical)
      const typeName = s("typeName", 120); if (!typeName) throw new Error("Which type?");
      const onlyTrack = s("onlyTrack", 60) || null, passFail = !!a.passFail;
      await bdb.curriculumTypeRule.upsert({ where: { curriculumId_typeName: { curriculumId: c.id, typeName } }, create: { curriculumId: c.id, typeName, passFail, onlyTrack }, update: { passFail, onlyTrack, at: new Date() } });
      return `${typeName}: ${passFail ? "pass / fail, not in GPA" : "graded"}${onlyTrack ? ` · only for ${onlyTrack} students` : " · for every student"}.`;
    }
    case "applyTemplate": {
      const tpl = TEMPLATES.find((t) => t.key === s("templateKey"));
      if (!tpl) throw new Error("Choose a template.");
      await writeTypes(c.id, tpl.types, true);
      if (!(await bdb.curriculumTrack.count({ where: { curriculumId: c.id } }))) for (const [i, name] of tpl.tracks.entries()) await bdb.curriculumTrack.create({ data: { id: randomUUID(), curriculumId: c.id, name, position: i } });
      const moved = await autoPlaceAll(c.id, true);
      return `Template applied; ${moved} course(s) placed automatically — check them.`;
    }
    case "autoPlace": return `${await autoPlaceAll(c.id, false)} course(s) placed.`;
    case "track": {
      const x = await course(); const tid = s("trackId");
      if (!(await bdb.curriculumTrack.findFirst({ where: { id: tid, curriculumId: c.id } }))) throw new Error("Track not found.");
      if (a.on === false) await bdb.masterCourseTrack.deleteMany({ where: { masterCourseId: x.id, trackId: tid } });
      else {
        if (a.move && s("fromTrackId")) await bdb.masterCourseTrack.deleteMany({ where: { masterCourseId: x.id, trackId: s("fromTrackId") } });
        await bdb.masterCourseTrack.upsert({ where: { masterCourseId_trackId: { masterCourseId: x.id, trackId: tid } }, create: { masterCourseId: x.id, trackId: tid }, update: {} });
      }
      return "Saved.";
    }
    case "addTrack": { const name = s("name", 60); if (!name) throw new Error("Name the track."); const n = await bdb.curriculumTrack.count({ where: { curriculumId: c.id } }); await bdb.curriculumTrack.create({ data: { id: randomUUID(), curriculumId: c.id, name, position: n, minCourses: num("minCourses") } }); return `Track ${name} added.`; }
    case "editTrack": { await bdb.curriculumTrack.updateMany({ where: { id: s("trackId"), curriculumId: c.id }, data: { ...(s("name") ? { name: s("name", 60) } : {}), ...(a.minCourses !== undefined ? { minCourses: num("minCourses") } : {}) } }); return "Saved."; }
    case "removeTrack": { await bdb.masterCourseTrack.deleteMany({ where: { trackId: s("trackId") } }); await bdb.curriculumTrack.deleteMany({ where: { id: s("trackId"), curriculumId: c.id } }); return "Track removed."; }
    case "submit": { await (await import("./stageGates")).assertPublishable(c.id); await prisma.masterCurriculum.update({ where: { id: c.id }, data: { status: "SUBMITTED" } }); const admins = await prisma.user.findMany({ where: { role: "SUPER_USER" }, select: { id: true } }); const { notifyUsers } = await import("./notifications"); await notifyUsers(admins.map((x) => x.id), { kind: "CURRICULUM", title: `Curriculum to publish: ${c.authority} ${c.title} ${c.version}`, href: `/curricula/builder/${c.id}?step=review` }); return "Submitted for publishing."; }
    case "publish": {
      if (user.role !== "SUPER_USER" && c.chairmanId === null) throw new Error("Official curricula are published by the Super User.");
      // The HEC stage-gates (categories, course list with choice buffers, every course 100% OBE-complete) must all pass.
      await (await import("./stageGates")).assertPublishable(c.id);
      await prisma.masterCurriculum.update({ where: { id: c.id }, data: { status: "PUBLISHED" } });
      if (a.supersede) await prisma.masterCurriculum.updateMany({ where: { id: s("supersede") }, data: { status: "SUPERSEDED" } });
      await writeAuditLog({ actorUserId: user.id, action: "CURRICULUM_PUBLISHED", entityType: "MasterCurriculum", entityId: c.id });
      // Program Leads whose batches use this curriculum review any changes (nothing changes in their batches by itself).
      const users = await prisma.course.findMany({ where: { masterCourse: { masterCurriculumId: c.id } }, select: { coordinatorId: true, batchId: true }, distinct: ["batchId"] });
      if (users.length) { const { notifyUsers } = await import("./notifications"); await notifyUsers(Array.from(new Set(users.map((u) => u.coordinatorId))), { kind: "CURRICULUM", title: `Master curriculum updated: ${c.title} ${c.version}`, body: "Review what changed for your batches; nothing changes until you apply it.", href: "/coordinator/curriculum-sync" }); }
      // A new national curriculum: every Program Lead of that discipline is told it can be chosen for their next batch.
      if (c.chairmanId === null) {
        const { familyOf } = await import("./batchBoard");
        const fam = familyOf(c.title);
        const leads = await prisma.batch.findMany({ select: { coordinatorId: true, degreeProgram: true }, distinct: ["coordinatorId", "degreeProgram"] });
        const ids = Array.from(new Set(leads.filter((l) => familyOf(l.degreeProgram) === fam).map((l) => l.coordinatorId)));
        if (ids.length) { const { notifyUsers } = await import("./notifications"); await notifyUsers(ids, { kind: "CURRICULUM", title: `New national curriculum: ${c.authority} ${c.title} ${c.version}`, body: "You can choose it for your next batch (Courses → Add courses from).", href: "/curricula?show=national" }).catch(() => null); }
      }
      return "Published.";
    }
    case "reopen": { await prisma.masterCurriculum.update({ where: { id: c.id }, data: { status: "DRAFT" } }); return "Back to draft."; }
    default: throw new Error("Unknown action.");
  }
}
