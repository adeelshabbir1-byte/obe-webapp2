import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { controllerAccess } from "./examController";
import { paperOf, courseCtx } from "./qbank";
import { mergeConfig, resolveTemplate, headerRows, layoutSections, access, watermarkOf, seenBy, type TemplateConfig, type TemplateRow, type Scope, type Filled } from "./paperTemplateCore";
import type { Layout, PaperQ } from "./paperExport";

// Paper templates and paper security (Part 6, build C). The Controller (Exam office) sets the institute's paper
// template, with department or program variants and variants per exam type; the system fills the fields for each
// course; the teacher may change a filled value on a paper (every edit logged). After vetting, a mid / final paper is
// locked until exam day: only the HOD and the Controller open it, only the Controller prints or downloads it (with a
// watermark). Every view, print and download is logged, read-only, shown on the paper, and the setter is told.

const db = prisma as unknown as Record<string, any>;
export const TEMPLATE_HINT = "Run prisma/migration_paper_templates.sql in Supabase first.";
type U = { id: string; role: string; name: string; managedById: string | null; extraRoles?: string[] | null; departmentId?: string | null };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export async function templatesOf(chairmanId: string): Promise<TemplateRow[]> {
  const rows = ((await db.paperTemplate?.findMany({ where: { chairmanId }, orderBy: [{ scope: "asc" }, { examType: "asc" }] }).catch(() => [])) || []) as { id: string; scope: Scope; scopeId: string | null; examType: string; configJson: string }[];
  return rows.map((r) => ({ id: r.id, scope: r.scope, scopeId: r.scopeId, examType: r.examType, config: mergeConfig(J(r.configJson, {})) }));
}
async function needController(u: U) {
  const a = await controllerAccess(u as never);
  if (!a || a.mode === "VIEW") throw new Error("The Controller of Examinations (Exam office) sets the paper templates.");
  return a.chairmanId;
}
export async function saveTemplate(u: U, b: { id?: string; scope: Scope; scopeId?: string | null; examType?: string; config: Partial<TemplateConfig> }) {
  const chairmanId = await needController(u);
  const scope: Scope = ["INSTITUTE", "DEPARTMENT", "PROGRAM"].includes(b.scope) ? b.scope : "INSTITUTE";
  const scopeId = scope === "INSTITUTE" ? null : String(b.scopeId || "");
  if (scope !== "INSTITUTE" && !scopeId) throw new Error(scope === "DEPARTMENT" ? "Choose the department." : "Choose the program.");
  const examType = ["ALL", "Quiz", "Midterm", "Final"].includes(String(b.examType)) ? String(b.examType) : "ALL";
  const config = mergeConfig(b.config);
  config.fontSize = Math.max(8, Math.min(16, Number(config.fontSize) || 11)); config.margins = Math.max(0.4, Math.min(2, Number(config.margins) || 1));
  const existing = await db.paperTemplate.findFirst({ where: { chairmanId, scope, scopeId, examType } });
  const id = existing?.id || randomUUID();
  if (existing) await db.paperTemplate.update({ where: { id }, data: { configJson: JSON.stringify(config), updatedById: u.id, updatedAt: new Date() } });
  else await db.paperTemplate.create({ data: { id, chairmanId, scope, scopeId, examType, configJson: JSON.stringify(config), updatedById: u.id } });
  await writeAuditLog({ actorUserId: u.id, action: "PAPER_TEMPLATE_SAVED", entityType: "PaperTemplate", entityId: id, metadata: { scope, scopeId: scopeId || "", examType } });
  return { id };
}
export async function deleteTemplate(u: U, id: string) {
  const chairmanId = await needController(u);
  await db.paperTemplate.deleteMany({ where: { id, chairmanId } });
  return { deleted: true };
}

/** The values the system fills for this paper's course (institute, faculty, department, program, course, term …). */
export async function autoFill(paperId: string) {
  const { p, ctx, questions } = await paperOf(paperId);
  const c = await prisma.course.findUniqueOrThrow({ where: { id: p.courseId }, select: { code: true, title: true, semesterNumber: true, instructor: { select: { name: true } }, batch: { select: { batchName: true, degreeProgram: true } }, subjectHomeDepartment: { select: { id: true, name: true, faculty: { select: { name: true } } } }, coordinator: { select: { departmentId: true, managedById: true, department_: { select: { id: true, name: true, faculty: { select: { name: true } } } } } } } });
  // The course's department: its subject home when set (a Management course in a CS program), else the program's.
  const dep = c.subjectHomeDepartment || c.coordinator.department_;
  const head = await prisma.user.findUnique({ where: { id: c.coordinator.managedById || "none" }, select: { instituteName: true, name: true, instituteLogo: true } });
  const o = J<{ minutes?: number }>(p.optsJson, {});
  const auto: Filled = {
    institute: head?.instituteName || head?.name || "", faculty: dep?.faculty?.name || "", department: dep?.name || "", program: c.batch?.degreeProgram || "",
    course: `${c.code} ${c.title}`, semester: c.semesterNumber ? `Semester ${c.semesterNumber}` : "", term: p.termLabel || "", section: c.batch?.batchName || "", teacher: c.instructor?.name || "",
    examType: p.examType === "Midterm" ? "Mid-term examination" : p.examType === "Final" ? "Final examination" : p.examType, date: "", time: "", duration: o.minutes ? `${o.minutes} minutes` : "", total: String(questions.reduce((a, q) => a + q.marks, 0)),
  };
  return { auto, departmentId: dep?.id || c.coordinator.departmentId || null, program: c.batch?.degreeProgram || null, chairmanId: ctx.chairmanId, logo: head?.instituteLogo || null };
}
export async function valuesOf(paperId: string): Promise<Filled> {
  return J<Filled>((await db.paperValues?.findUnique({ where: { paperId } }).catch(() => null))?.valuesJson, {});
}
/** The teacher changes a filled value on this paper (a different date …); every edit is logged. */
export async function editValue(u: U, paperId: string, field: string, value: string) {
  const { p } = await paperOf(paperId);
  const c = await prisma.course.findUniqueOrThrow({ where: { id: p.courseId }, select: { instructorId: true, subjectExpertId: true } });
  if (u.id !== c.instructorId && u.id !== c.subjectExpertId && u.id !== p.createdById) throw new Error("Only the paper's teacher edits its values.");
  const sec = await security(u, paperId);
  if (sec.lockedNow) throw new Error("The paper is locked after vetting.");
  const cur = await valuesOf(paperId); const auto = (await autoFill(paperId)).auto;
  const old = cur[field] ?? auto[field] ?? "";
  cur[field] = value.slice(0, 200);
  await db.paperValues.upsert({ where: { paperId }, create: { paperId, valuesJson: JSON.stringify(cur) }, update: { valuesJson: JSON.stringify(cur), updatedAt: new Date() } });
  await db.paperFieldEdit.create({ data: { id: randomUUID(), paperId, field, oldValue: String(old).slice(0, 200), newValue: value.slice(0, 200), byId: u.id } });
  await writeAuditLog({ actorUserId: u.id, action: "PAPER_VALUE_EDITED", entityType: "QbPaper", entityId: paperId, metadata: { field, from: String(old).slice(0, 100), to: value.slice(0, 100) } });
  return { field, value };
}

/** The paper laid out in its template: header, instructions, sections, numbering, footer, watermark. */
export async function layoutOf(paperId: string, watermark: string | null = null): Promise<{ l: Layout; qs: PaperQ[]; name: string; template: TemplateRow | null }> {
  const { p, ctx, questions } = await paperOf(paperId);
  const f = await autoFill(paperId);
  const t = resolveTemplate(await templatesOf(f.chairmanId), { departmentId: f.departmentId, program: f.program, examType: p.examType });
  const cfg = mergeConfig(t?.config);
  const edits = await valuesOf(paperId);
  const toQ = (q: (typeof questions)[number], no: string, partNo: (i: number, label: string) => string): PaperQ => ({ no, text: q.text, marks: q.marks, clo: q.cloCodes[0], options: J<string[]>(q.meta?.optionsJson, []), parts: q.parts.map((x, i) => ({ label: partNo(i, x.label).replace(/^\(|\)$/g, ""), text: x.text, marks: x.marks, clo: x.cloCode })) });
  const secs = layoutSections(questions, cfg);
  const qs = secs.flatMap((s) => s.items.map((it) => toQ(it.q, it.no, it.partNo)));
  const title = edits.title || `${f.auto.institute}`.trim() || `${ctx.course.code} ${p.examType}`;
  const l: Layout = {
    title, header: headerRows(cfg, f.auto, edits), instructions: edits.instructions ?? cfg.instructions, showMarks: cfg.showMarks, showClo: cfg.showClo, numbering: cfg.numbering,
    sections: secs.map((s) => ({ title: s.title, note: s.note || undefined, questions: s.items.map((it) => toQ(it.q, it.no, it.partNo)) })),
    footer: `${cfg.footer.replace("{page}", "").replace("{pages}", "").replace(/page\s*of/i, "").trim() || `${ctx.course.code} ${p.examType}`}${cfg.turnOver ? " · Turn over" : ""}`.trim(),
    watermark: [cfg.watermark, watermark].filter(Boolean).join(" · ") || null, fontSize: cfg.fontSize, margins: cfg.margins, rollBoxes: cfg.fields.rollBoxes, page: cfg.page, answerSheet: cfg.answerSheet,
  };
  return { l, qs, name: `${ctx.course.code}-${p.examType}-${p.variant}`, template: t };
}

// ---------------------------------------------------------------- security
export async function security(u: U, paperId: string) {
  const { p } = await paperOf(paperId);
  const c = await prisma.course.findUniqueOrThrow({ where: { id: p.courseId }, select: { instructorId: true, subjectExpertId: true, coordinatorId: true, subjectHomeDepartmentId: true, coordinator: { select: { departmentId: true, managedById: true } } } });
  const official = p.status === "ADOPTED" && ["Midterm", "Final"].includes(p.examType);
  const vet = official ? await db.paperVetting.findUnique({ where: { courseId_examType: { courseId: p.courseId, examType: p.examType } } }).catch(() => null) : null;
  const locked = official && vet?.status === "APPROVED";
  const vals = await valuesOf(paperId);
  const examDay = vals.date ? new Date(vals.date) : null;
  const ctrl = await controllerAccess(u as never).catch(() => null);
  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { departmentId: true, role: true } });
  const ctx = await courseCtx(p.courseId);
  const v = { id: u.id, isSetter: u.id === p.createdById || u.id === c.instructorId, isHod: me?.role === "HEAD_OF_DEPARTMENT" && !!me.departmentId && (me.departmentId === c.coordinator.departmentId || me.departmentId === c.subjectHomeDepartmentId), isController: !!ctrl && ctrl.mode !== "VIEW" && ctrl.chairmanId === ctx.chairmanId, isReviewer: u.id === ctx.seId || ctx.plIds.includes(u.id) || (vet?.reviewerId === u.id) };
  return { ...access(v, { locked, examDay }), official, locked, viewer: v, setterIds: [p.createdById, c.instructorId].filter((x): x is string => !!x) };
}
const ROLE_NAME: Record<string, string> = { HEAD_OF_DEPARTMENT: "HOD", PROGRAM_COORDINATOR: "PL", INSTRUCTOR: "Teacher", SUBJECT_EXPERT: "SE", OMC: "OMC", CHAIRMAN: "Institute Head", DEAN: "Dean" };
/** Open, print or download: checked, logged (read-only), and the setter is told when it is someone else. */
export async function touch(u: U, paperId: string, action: "OPENED" | "PRINTED" | "DOWNLOADED") {
  const s = await security(u, paperId);
  const allowed = action === "OPENED" ? s.open : s.download;
  if (!allowed) throw Object.assign(new Error(s.lockedNow ? (action === "OPENED" ? "This paper is locked until exam day: only the HOD and the Controller can open it." : "Only the Controller prints or downloads a locked paper.") : "You cannot open this paper."), { status: 403 });
  if (s.official) {
    const role = s.viewer.isController ? "Controller" : ROLE_NAME[u.role] || u.role;
    await db.paperAccessLog.create({ data: { id: randomUUID(), paperId, userId: u.id, role, action } });
    const others = s.setterIds.filter((x) => x !== u.id);
    if (others.length) {
      const { p, ctx } = await paperOf(paperId);
      await notifyUsers(others, { kind: "INFO", title: `${role} ${action.toLowerCase()} your ${ctx.course.code} ${p.examType.toLowerCase()} paper`, body: `${u.name} (${role}) — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, href: `/papers/${paperId}` }).catch(() => null);
    }
  }
  return { ...s, watermark: action === "OPENED" ? null : watermarkOf(u.name, new Date()) };
}
export async function logOf(paperId: string) {
  const rows = ((await db.paperAccessLog?.findMany({ where: { paperId }, orderBy: { at: "asc" } }).catch(() => [])) || []) as { userId: string; role: string; action: string; at: Date }[];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const list = rows.map((r) => ({ ...r, name: names.get(r.userId) || "" }));
  return { list, line: seenBy(list) };
}
