import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { readWorkbookGrids } from "./excelRead";
import { SHEETS, PART_LABEL, parseWorkbook, checkWorkbook, counts, countsLine, type Mapping, type PartKey, type Parsed } from "./planWorkbookCore";

// Import an SE's (or an Instructor's) existing Excel workbook into a course plan: course details, CLOs with Bloom and GA,
// the lecture plan, assessment counts and weights, quiz / assignment topics, mid and final questions. Preview first;
// the person ticks the parts. A Subject Expert's plan is written through the plan's own save routes (CLO save, the
// lecture import, the weights form, the assessment mapping, paper distribution), so every existing check still
// applies; an approved plan is never overwritten — the import becomes a change request; a synced follower course
// sends you to its base course. Every import is a version that can be undone; the file is kept (private bucket).

const db = prisma as unknown as Record<string, any>;
type Who = { id: string; role: string; name: string; managedById: string | null };
type Src = "SE" | "INSTRUCTOR";

/** The blank template: one sheet per part with its headings and one example row, and a legend. */
export async function templateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const legend = wb.addWorksheet("Legend");
  legend.addRow(["OBEHUB course-plan workbook"]).font = { bold: true, size: 13 };
  legend.addRow(["Fill one course per file. Keep the sheet names and headings (your own names also work: you point to them once)."]);
  legend.addRow([]);
  for (const s of SHEETS) legend.addRow([s.title, s.help]);
  legend.addRow([]);
  legend.addRow(["Bloom levels", "C1–C6 (cognitive), P1–P7 (psychomotor), A1–A5 (affective)"]);
  legend.addRow(["CLO", "CLO-1, CLO-2 … (or just the number)"]);
  legend.addRow(["GA", "GA-1 … (this batch's graduate attributes)"]);
  legend.getColumn(1).width = 28; legend.getColumn(2).width = 100;
  for (const s of SHEETS) {
    const ws = wb.addWorksheet(s.title);
    ws.addRow(s.fields.map((f) => f.label)).font = { bold: true };
    ws.addRow(s.fields.map((f) => f.example));
    s.fields.forEach((f, i) => { ws.getColumn(i + 1).width = Math.max(10, Math.min(60, f.example.length + 6)); });
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function courseFor(user: Who, courseId: string, source: Src) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, batchId: true, subjectExpertId: true, instructorId: true, templateStatus: true, coordinatorId: true, catalogDescription: true, textbook: true, referenceMaterial: true, programmingAssignmentsNote: true, labInstructorName: true, coordinator: { select: { managedById: true } } } });
  if (!c) throw new Error("Course not found.");
  if (source === "SE" && c.subjectExpertId !== user.id) throw new Error("Only this course's Subject Expert imports into its plan.");
  if (source === "INSTRUCTOR" && c.instructorId !== user.id) throw new Error("Only this course's teacher imports into the teaching copy.");
  if (source === "SE") {
    const { blockedAsNonBaseCourse } = await import("./contentSync");
    const blocked = await blockedAsNonBaseCourse(c.id).catch(() => null);
    if (blocked) throw new Error(`${blocked} Import into the base course instead.`);
  }
  return c;
}

export async function mappingOf(chairmanId: string): Promise<Mapping> {
  const r = await db.planImportMapping?.findUnique({ where: { chairmanId } }).catch(() => null);
  try { return r ? JSON.parse(r.mappingJson) : {}; } catch { return {}; }
}
export async function saveMapping(chairmanId: string, m: Mapping, by: string) {
  const cur = await mappingOf(chairmanId);
  const merged = { ...cur, ...m };
  await db.planImportMapping.upsert({ where: { chairmanId }, create: { chairmanId, mappingJson: JSON.stringify(merged), updatedById: by }, update: { mappingJson: JSON.stringify(merged), updatedById: by, updatedAt: new Date() } });
  return merged;
}

/** What the file holds, what is missing or invalid, and what it would replace — nothing is saved. */
export async function previewImport(user: Who, courseId: string, source: Src, file: File, extra: Mapping = {}) {
  const c = await courseFor(user, courseId, source);
  const chairmanId = c.coordinator.managedById || "";
  const p = parseWorkbook(await readWorkbookGrids(file), { ...(await mappingOf(chairmanId)), ...extra });
  const [clos, rows, plos, insts, papers] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source }, select: { code: true } }),
    prisma.lectureRow.findMany({ where: { courseId, source }, select: { lectureNumber: true } }),
    c.batchId ? prisma.pLO.findMany({ where: { batchId: c.batchId }, select: { number: true } }) : Promise.resolve([] as { number: number }[]),
    prisma.assessmentInstrument.findMany({ where: { courseId, source }, select: { type: true, label: true } }),
    prisma.paperDistributionItem.findMany({ where: { courseId, source }, select: { examType: true } }),
  ]);
  const problems = checkWorkbook(p, { existingClos: clos.map((x) => x.code), gaNumbers: plos.map((x) => x.number) });
  const have = new Set(clos.map((x) => x.code)), lec = new Set(rows.map((r) => r.lectureNumber));
  const replaced: Partial<Record<PartKey, string>> = {
    course: p.course ? "the description and books" : undefined,
    clos: p.clos.length ? `${p.clos.filter((x) => have.has(x.code)).length} CLO(s) updated, ${p.clos.filter((x) => !have.has(x.code)).length} added` : undefined,
    lectures: p.lectures.length ? `${p.lectures.filter((l) => lec.has(l.lecture)).length} lecture(s) updated, ${p.lectures.filter((l) => !lec.has(l.lecture)).length} added (their CLO and assessment links stay)` : undefined,
    assessments: p.assessments.length ? `the weights and counts (now ${insts.length} item(s))` : undefined,
    items: p.items.length ? `${p.items.length} item(s): their lectures and marks` : undefined,
    questions: p.questions.length ? `the ${Array.from(new Set(p.questions.map((q) => q.exam))).join(" and ")} questions (${papers.filter((x) => p.questions.some((q) => q.exam === x.examType)).length} now)` : undefined,
  };
  const parts = (Object.keys(PART_LABEL) as PartKey[]).filter((k) => k === "course" ? !!p.course : (p[k] as unknown[]).length > 0);
  return { course: `${c.code} ${c.title}`, parts, counts: counts(p), line: countsLine(counts(p)), problems, replaced, found: p.found, unmatched: p.unmatched, approved: source === "SE" && c.templateStatus === "approved", parsed: p };
}

async function snapshot(courseId: string, source: Src) {
  const [course, clos, rows, insts, links, papers] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { catalogDescription: true, textbook: true, referenceMaterial: true, quizPct: true, assignmentPct: true, projectPct: true, labPct: true, midtermPct: true, finalPct: true, quizCount: true, assignmentCount: true, projectCount: true, labCount: true, midtermCount: true, finalCount: true } }),
    prisma.cLO.findMany({ where: { courseId, source } }),
    prisma.lectureRow.findMany({ where: { courseId, source } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId, source } } }),
    prisma.paperDistributionItem.findMany({ where: { courseId, source } }),
  ]);
  return { course, clos, rows, insts, links, papers };
}

/** Calls one of the plan's own API routes as the signed-in person (so its checks and side effects run). */
async function route(req: Request, handler: (r: NextRequest, ctx?: any) => Promise<Response>, path: string, body: unknown, params: Record<string, string>, method = "POST") {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const r = new NextRequest(new URL(path, req.url), { method, headers: isForm ? { cookie: req.headers.get("cookie") || "" } : { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" }, body: isForm ? (body as FormData) : JSON.stringify(body) });
  const res = await handler(r, { params });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `The plan refused it (${res.status}).`);
  return d as Record<string, any>;
}

/** Applies the ticked parts. An approved Subject Expert plan: a change request instead (kept until the OMC reopens it). */
export async function applyImport(user: Who, req: Request, courseId: string, source: Src, file: File, parts: PartKey[], extra: Mapping = {}) {
  const pv = await previewImport(user, courseId, source, file, extra);
  const chosen = parts.filter((k) => pv.parts.includes(k));
  if (!chosen.length) throw new Error("Tick at least one part to import.");
  const bad = chosen.flatMap((k) => pv.problems[k].map((x) => `${PART_LABEL[k]}: ${x}`));
  if (bad.length) return { error: "Nothing was saved — fix these first.", problems: bad };
  const buf = Buffer.from(await file.arrayBuffer());
  let fileRef: string | null = null;
  try { const { storePrivate } = await import("./sampleStorage"); fileRef = await storePrivate(buf, file.name, file.type || "application/octet-stream", `plan-imports/${courseId}`); }
  catch { fileRef = buf.length <= 2_000_000 ? `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buf.toString("base64")}` : null; }
  const id = randomUUID();
  const base = { id, courseId, source, byUserId: user.id, fileName: file.name.slice(0, 200), fileRef, partsJson: JSON.stringify(chosen), parsedJson: JSON.stringify(pv.parsed), summary: pv.line };
  if (pv.approved) {
    const { POST } = await import("../app/api/subjectexpert/courses/[courseId]/change-request/route");
    await route(req, POST as never, `/api/subjectexpert/courses/${courseId}/change-request`, { reason: `Import from Excel (${file.name}): ${pv.line}. Parts: ${chosen.map((k) => PART_LABEL[k]).join(", ")}.` }, { courseId }).catch((e) => { if (!/already/i.test((e as Error).message)) throw e; });
    await db.planImport.create({ data: { ...base, status: "PENDING", beforeJson: "{}" } });
    await writeAuditLog({ actorUserId: user.id, action: "PLAN_IMPORT_REQUESTED", entityType: "Course", entityId: courseId, metadata: { file: file.name, parts: chosen.join(",") } });
    return { requested: true, id };
  }
  await db.planImport.create({ data: { ...base, status: "APPLYING", beforeJson: JSON.stringify(await snapshot(courseId, source)) } });
  try { await writeParts(user, req, courseId, source, pv.parsed, chosen); }
  catch (e) { await db.planImport.update({ where: { id }, data: { status: "FAILED", summary: `${pv.line} — stopped: ${(e as Error).message}`.slice(0, 1000) } }); await undoImport(user, id, true).catch(() => null); throw e; }
  await db.planImport.update({ where: { id }, data: { status: "APPLIED", appliedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "PLAN_IMPORTED", entityType: "Course", entityId: courseId, metadata: { file: file.name, parts: chosen.join(","), summary: pv.line } });
  return { applied: true, id, line: pv.line };
}

/** A pending import (approved plan) once the OMC has reopened the plan. */
export async function applyPending(user: Who, req: Request, importId: string) {
  const imp = await db.planImport.findUnique({ where: { id: importId } });
  if (!imp || imp.status !== "PENDING") throw new Error("No pending import.");
  const c = await courseFor(user, imp.courseId, imp.source);
  if (imp.source === "SE" && c.templateStatus === "approved") throw new Error("The plan is still approved: the OMC has not reopened it yet.");
  await db.planImport.update({ where: { id: importId }, data: { status: "APPLYING", beforeJson: JSON.stringify(await snapshot(imp.courseId, imp.source)) } });
  try { await writeParts(user, req, imp.courseId, imp.source, JSON.parse(imp.parsedJson) as Parsed, JSON.parse(imp.partsJson) as PartKey[]); }
  catch (e) { await undoImport(user, importId, true).catch(() => null); throw e; }
  await db.planImport.update({ where: { id: importId }, data: { status: "APPLIED", appliedAt: new Date() } });
  return { applied: true };
}

async function writeParts(user: Who, req: Request, courseId: string, source: Src, p: Parsed, parts: PartKey[]) {
  const c = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, batchId: true, catalogDescription: true, textbook: true, referenceMaterial: true, programmingAssignmentsNote: true, labInstructorName: true } });
  const ploId = new Map((c.batchId ? await prisma.pLO.findMany({ where: { batchId: c.batchId }, select: { id: true, number: true } }) : []).map((x) => [x.number, x.id]));
  const params = { courseId };
  const se = source === "SE";
  if (parts.includes("course") && p.course) {
    const data = { catalogDescription: p.course.description || c.catalogDescription, textbook: p.course.textbook || c.textbook, referenceMaterial: p.course.reference || c.referenceMaterial };
    if (se) { const { PUT } = await import("../app/api/subjectexpert/courses/[courseId]/description-fields/route"); await route(req, PUT, `/api/subjectexpert/courses/${courseId}/description-fields`, { ...data, programmingAssignmentsNote: c.programmingAssignmentsNote, labInstructorName: c.labInstructorName }, params, "PUT"); }
    else await prisma.course.update({ where: { id: courseId }, data });
  }
  if (parts.includes("clos")) {
    const existing = await prisma.cLO.findMany({ where: { courseId, source }, orderBy: { orderIndex: "asc" } });
    for (const x of p.clos) {
      const mapped = x.ga ? ploId.get(x.ga) || null : null;
      const cur = existing.find((e) => e.code === x.code);
      if (se) {
        if (cur) { const { PATCH } = await import("../app/api/subjectexpert/courses/[courseId]/clo/[cloId]/route"); await route(req, PATCH, `/api/subjectexpert/courses/${courseId}/clo/${cur.id}`, { statement: x.statement, bloomLevel: x.bloom, mappedPloId: mapped ?? cur.mappedPloId, code: x.code }, { courseId, cloId: cur.id }, "PATCH"); }
        else { const { POST } = await import("../app/api/subjectexpert/courses/[courseId]/clo/route"); await route(req, POST, `/api/subjectexpert/courses/${courseId}/clo`, { statement: x.statement, bloomLevel: x.bloom, mappedPloId: mapped }, params); }
      } else if (cur) await prisma.cLO.update({ where: { id: cur.id }, data: { statement: x.statement, bloomLevel: x.bloom, ...(mapped ? { mappedPloId: mapped } : {}) } });
      else { const n = await prisma.cLO.count({ where: { courseId, source } }); await prisma.cLO.create({ data: { courseId, source, code: x.code, statement: x.statement, bloomLevel: x.bloom, orderIndex: n, mappedPloId: mapped, targetPct: 60 } as never }); }
    }
  }
  if (parts.includes("lectures") && p.lectures.length) {
    if (se) {
      // Through the plan's own lecture import (one clean sheet, so the person's headings never matter there).
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Lecture topics");
      ws.addRow(["Lecture", "Week", "Topic", "Sub topic", "CLO"]);
      for (const l of p.lectures) ws.addRow([l.lecture, l.week, l.topic, l.subtopic || "", l.clo || ""]);
      const fd = new FormData();
      fd.set("file", new File([Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)], "lectures.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      fd.set("apply", "1");
      const { POST } = await import("../app/api/subjectexpert/courses/[courseId]/lecture/import-excel/route");
      await route(req, POST, `/api/subjectexpert/courses/${courseId}/lecture/import-excel`, fd, params);
    } else {
      const clos = new Map((await prisma.cLO.findMany({ where: { courseId, source } })).map((x) => [x.code, x.id]));
      const rows = new Map((await prisma.lectureRow.findMany({ where: { courseId, source } })).map((r) => [r.lectureNumber, r]));
      for (const l of p.lectures) {
        const data = { week: l.week, topic: l.topic.slice(0, 500), subtopic: l.subtopic, cloId: l.clo ? clos.get(l.clo) || null : null };
        const e = rows.get(l.lecture);
        if (e) await prisma.lectureRow.update({ where: { id: e.id }, data }); else await prisma.lectureRow.create({ data: { courseId, source, lectureNumber: l.lecture, ...data } });
      }
    }
  }
  if (parts.includes("assessments") && p.assessments.length) {
    const key: Record<string, string> = { Quiz: "quiz", Assignment: "assignment", Project: "project", Lab: "lab", Midterm: "midterm", Final: "final" };
    const body: Record<string, number> = { quizPct: 0, assignmentPct: 0, projectPct: 0, labPct: 0, midtermPct: 0, finalPct: 0 };
    for (const a of p.assessments) { body[`${key[a.type]}Pct`] = Math.round(a.weight); body[`${key[a.type]}Count`] = a.count; }
    if (se) { const { PUT } = await import("../app/api/subjectexpert/courses/[courseId]/weights/route"); await route(req, PUT, `/api/subjectexpert/courses/${courseId}/weights`, body, params, "PUT"); }
    else await prisma.course.update({ where: { id: courseId }, data: body as never });
  }
  if (parts.includes("items") && p.items.length) {
    const insts = await prisma.assessmentInstrument.findMany({ where: { courseId, source }, orderBy: { label: "asc" } });
    const rows = new Map((await prisma.lectureRow.findMany({ where: { courseId, source } })).map((r) => [r.lectureNumber, r.id]));
    const find = (t: string, n: number) => insts.find((i) => i.type === t && new RegExp(`\\b${n}\\b`).test(i.label)) || insts.filter((i) => i.type === t)[n - 1];
    const edits: { instrumentId: string; maxScore?: number }[] = [], toggles: { lectureRowId: string; instrumentId: string; linked: boolean }[] = [];
    for (const it of p.items) {
      const inst = find(it.type, it.no);
      if (!inst) throw new Error(`${it.type} ${it.no} is not in the plan — import the assessment counts too, or add it first.`);
      if (it.max && it.max !== inst.maxScore) edits.push({ instrumentId: inst.id, maxScore: it.max });
      for (const n of it.lectures) { const lr = rows.get(n); if (lr) toggles.push({ lectureRowId: lr, instrumentId: inst.id, linked: true }); }
    }
    if (se) {
      if (edits.length) { const { POST } = await import("../app/api/subjectexpert/courses/[courseId]/instruments/batch-save/route"); await route(req, POST, `/api/subjectexpert/courses/${courseId}/instruments/batch-save`, { edits }, params); }
      if (toggles.length) { const { POST } = await import("../app/api/subjectexpert/courses/[courseId]/lecture-mapping/save/route"); await route(req, POST, `/api/subjectexpert/courses/${courseId}/lecture-mapping/save`, { toggles, questions: [] }, params); }
    } else {
      for (const e of edits) await prisma.assessmentInstrument.update({ where: { id: e.instrumentId }, data: { maxScore: e.maxScore } });
      if (toggles.length) await prisma.lectureRowInstrument.createMany({ data: toggles.map((t) => ({ lectureRowId: t.lectureRowId, instrumentId: t.instrumentId })), skipDuplicates: true });
    }
  }
  if (parts.includes("questions") && p.questions.length) {
    const clos = new Map((await prisma.cLO.findMany({ where: { courseId, source } })).map((x) => [x.code, x.id]));
    const rows = await prisma.lectureRow.findMany({ where: { courseId, source }, select: { id: true, topic: true } });
    const exams = Array.from(new Set(p.questions.map((q) => q.exam)));
    await prisma.paperDistributionItem.deleteMany({ where: { courseId, source, examType: { in: exams } } });
    const { POST } = se ? await import("../app/api/subjectexpert/courses/[courseId]/paper-distribution/route") : { POST: null };
    for (const q of p.questions.slice().sort((a, b) => (a.exam === b.exam ? a.q - b.q : a.exam === "Midterm" ? -1 : 1))) {
      const lr = q.topic ? rows.find((r) => r.topic.toLowerCase().includes(q.topic!.toLowerCase()) || q.topic!.toLowerCase().includes(r.topic.toLowerCase())) : null;
      const body = { examType: q.exam, topicText: q.topic || `Question ${q.q}`, marks: q.marks, cloId: clos.get(q.clo) || null, cognitiveLevel: q.bloom, lectureRowId: lr?.id || null };
      if (se && POST) await route(req, POST, `/api/subjectexpert/courses/${courseId}/paper-distribution`, body, params);
      else { const n = await prisma.paperDistributionItem.count({ where: { courseId, source, examType: q.exam } }); await prisma.paperDistributionItem.create({ data: { courseId, source, ...body, marks: q.marks || 0, questionNo: n + 1 } as never }); }
    }
  }
  if (!se) await import("./lectureWeights").then((m) => m.recomputeCourseRows(courseId, "INSTRUCTOR")).catch(() => null);
}

/** Undo an import: the plan goes back to how it was just before (rows the import added are removed). */
export async function undoImport(user: Who, importId: string, force = false) {
  const imp = await db.planImport.findUnique({ where: { id: importId } });
  if (!imp || (!force && imp.status !== "APPLIED")) throw new Error("Only an applied import can be undone.");
  if (!force) await courseFor(user, imp.courseId, imp.source);
  const later = !force ? await db.planImport.findFirst({ where: { courseId: imp.courseId, source: imp.source, status: "APPLIED", createdAt: { gt: imp.createdAt } } }) : null;
  if (later) throw new Error("A later import was applied after this one — undo that one first.");
  const b = JSON.parse(imp.beforeJson || "{}") as Awaited<ReturnType<typeof snapshot>>;
  if (!b.clos) throw new Error("Nothing to undo.");
  const { courseId, source } = imp;
  const keep = <T extends { id: string }>(xs: T[]) => new Set(xs.map((x) => x.id));
  await prisma.$transaction(async (tx) => {
    // Paper questions: back to exactly the saved ones.
    await tx.paperDistributionItem.deleteMany({ where: { courseId, source } });
    if (b.papers.length) await tx.paperDistributionItem.createMany({ data: b.papers.map((x) => ({ ...x, createdAt: new Date(x.createdAt as unknown as string), updatedAt: new Date((x as { updatedAt?: string }).updatedAt || Date.now()) })) as never });
    // Links, then instruments, lectures and CLOs: remove what the import added, restore what it changed.
    const instIds = keep(b.insts), rowIds = keep(b.rows), cloIds = keep(b.clos);
    await tx.lectureRowInstrument.deleteMany({ where: { instrument: { courseId, source } } });
    const newInst = (await tx.assessmentInstrument.findMany({ where: { courseId, source }, select: { id: true } })).filter((x) => !instIds.has(x.id)).map((x) => x.id);
    if (newInst.length) { await tx.studentMark.deleteMany({ where: { instrumentId: { in: newInst } } }); await tx.assessmentInstrument.deleteMany({ where: { id: { in: newInst } } }); }
    for (const i of b.insts) await tx.assessmentInstrument.update({ where: { id: i.id }, data: { label: i.label, marksPct: i.marksPct, maxScore: i.maxScore } }).catch(() => null);
    const newRows = (await tx.lectureRow.findMany({ where: { courseId, source }, select: { id: true } })).filter((x) => !rowIds.has(x.id)).map((x) => x.id);
    if (newRows.length) await tx.lectureRow.deleteMany({ where: { id: { in: newRows } } });
    for (const r of b.rows) await tx.lectureRow.update({ where: { id: r.id }, data: { lectureNumber: r.lectureNumber, week: r.week, topic: r.topic, subtopic: r.subtopic, cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct } }).catch(() => null);
    if (b.links.length) await tx.lectureRowInstrument.createMany({ data: b.links.map((l) => ({ lectureRowId: l.lectureRowId, instrumentId: l.instrumentId })), skipDuplicates: true });
    const newClos = (await tx.cLO.findMany({ where: { courseId, source }, select: { id: true } })).filter((x) => !cloIds.has(x.id)).map((x) => x.id);
    if (newClos.length) { await tx.lectureRow.updateMany({ where: { cloId: { in: newClos } }, data: { cloId: null } }); await tx.cLO.deleteMany({ where: { id: { in: newClos } } }); }
    for (const x of b.clos) await tx.cLO.update({ where: { id: x.id }, data: { code: x.code, statement: x.statement, bloomLevel: x.bloomLevel, mappedPloId: x.mappedPloId, ploContributionPct: x.ploContributionPct, orderIndex: x.orderIndex } }).catch(() => null);
    if (b.course) await tx.course.update({ where: { id: courseId }, data: b.course as never });
  }, { timeout: 60000, maxWait: 15000 });
  await import("./lectureWeights").then((m) => m.recomputeCourseRows(courseId, source)).catch(() => null);
  if (source === "SE") await import("./contentSync").then((m) => m.syncCourseContentToLinkedCourses(courseId)).catch(() => null);
  await db.planImport.update({ where: { id: importId }, data: { status: force ? "FAILED" : "UNDONE", undoneAt: new Date() } });
  if (!force) await writeAuditLog({ actorUserId: user.id, action: "PLAN_IMPORT_UNDONE", entityType: "Course", entityId: courseId, metadata: { file: imp.fileName } });
  return { undone: true };
}

export async function importsOf(courseId: string, source: Src) {
  const rows = (await db.planImport?.findMany({ where: { courseId, source }, orderBy: { createdAt: "desc" }, take: 10 }).catch(() => [])) || [];
  return (rows as { id: string; fileName: string; status: string; summary: string; createdAt: Date; byUserId: string; partsJson: string }[]).map((r) => ({ id: r.id, fileName: r.fileName, status: r.status, summary: r.summary, createdAt: r.createdAt, parts: (JSON.parse(r.partsJson || "[]") as PartKey[]).map((k) => PART_LABEL[k]) }));
}
