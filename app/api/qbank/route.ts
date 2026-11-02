import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import * as qb from "../../../lib/qbank";
import { SHEET_COLUMNS, TYPES } from "../../../lib/qbankCore";
import { readWorkbookGrids } from "../../../lib/excelRead";
import { paperPdf, paperDocx } from "../../../lib/paperExport";

// The question bank (Part 6, build A). Every call except the PIN ones needs the bank PIN (15 minutes idle).
// GET ?courseId=&q= the visible bank · ?template=1 the Excel template · ?paper=<id>&format=pdf|docx · ?mine=1 who used my
//   questions and my codes · ?pin=1 the PIN state.
// POST JSON { action: pinSet | pinVerify | add | review | share | code | redeem | revoke | unlock | draft | variant | adopt |
//   past | stats | saveAnalysed, … } · multipart { kind: sheet (apply=1 to import) | pdf, courseId, file }.
const ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "OMC", "CHAIRMAN", "DEAN", "CONTROLLER_EXAMS"];
type Res = NextResponse;
async function guard(): Promise<{ user: Awaited<ReturnType<typeof getAuthenticatedUser>> & object } | Res> {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { user };
}
const fail = (e: unknown) => {
  if ((e as { code?: string }).code) throw e;
  if ((e as { status?: number }).status === 403) return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  if ((e as { pin?: boolean }).pin) return NextResponse.json({ error: (e as Error).message, pin: true }, { status: 401 });
  return NextResponse.json({ error: (e as Error).message }, { status: 400 });
};
/** What leaves the server: no correct answers or model answers to anyone but those who may see the question. */
const shape = (x: Awaited<ReturnType<typeof qb.items>>[number], names: Map<string, string>) => ({
  id: x.id, type: x.type, text: x.text, marks: x.marks, cloCodes: x.cloCodes, bloom: x.bloom, difficulty: x.difficulty, measuredDifficulty: x.measuredDifficulty, lectureNumber: x.lectureNumber, week: x.week, topic: x.topic,
  author: names.get(x.authorId) || "", authorId: x.authorId, status: x.status, visibility: x.visibility, sharedWith: x.sharedWith, parts: x.parts, minutes: x.minutes, lab: x.lab, lockedUntil: x.lockedUntil, usedCount: x.usedCount, flags: x.flags, mcq: !!x.mcq,
  options: (() => { try { return JSON.parse(x.meta?.optionsJson || "[]"); } catch { return []; } })(), correct: x.ext?.correctJson ? JSON.parse(x.ext.correctJson) : x.meta?.correctIndex != null ? [x.meta.correctIndex] : [],
  modelAnswer: x.ext?.modelAnswer || x.meta?.rubric || null, numericAnswer: x.ext?.numericAnswer ?? null, tolerance: x.ext?.tolerance ?? null, tolMode: x.ext?.tolMode ?? null, source: [x.ext?.sourceKind, x.ext?.sourceNote].filter(Boolean).join(" · "), reviewNote: x.ext?.reviewNote || null, aiDraft: !!x.ext?.aiDraft, stats: (() => { try { return JSON.parse(x.ext?.statsJson || "{}"); } catch { return {}; } })(),
});

async function GET_handler(req: NextRequest) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { user } = g; const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("pin")) return NextResponse.json(await qb.pinState(user.id));
    if (sp.get("template")) {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Questions");
      ws.addRow(SHEET_COLUMNS).font = { bold: true };
      ws.addRow(["Which data structure is LIFO?\na) Queue\nb) Stack\nc) Tree", "MCQ", "", "CLO-1", "C1", "Easy", 1, "L3", "b", "Own"]);
      ws.addRow(["Explain how a stack differs from a queue, with an example of each.", "LONG", "a) Define both [CLO-1, 4]; b) Give an example of each [CLO-2, 6]", "CLO-1, CLO-2", "C2", "Medium", 10, "Stacks", "A stack is LIFO …", "Final Fall 2025"]);
      ws.addRow(["Evaluate $\\int_0^1 x^2\\,dx$.", "NUMERICAL", "", "CLO-3", "C3", "Medium", 2, "L20", "0.3333 ± 0.01", "Book ch. 5"]);
      const legend = wb.addWorksheet("Legend");
      legend.addRow(["Type", TYPES.map(([k, t]) => `${k} (${t})`).join(", ")]);
      legend.addRow(["Parts", "a) text [CLO-1, marks]; b) …  — the parts' marks add up to the question's"]);
      legend.addRow(["MCQ", "Options as lines a) … b) … in the question; Answer = the letter(s)"]);
      legend.addRow(["Numerical", "Answer = value, optionally ± tolerance"]);
      legend.addRow(["Topic", "L<lecture number> or the topic's name in the lecture plan"]);
      legend.addRow(["Equations", "LaTeX between $ signs, e.g. $\\frac{a}{b}$"]);
      ws.columns.forEach((c, i) => { c.width = i === 0 ? 60 : 16; });
      return new NextResponse(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="question-bank-template.xlsx"' } });
    }
    await qb.requirePin(user.id);
    if (sp.get("mine")) return NextResponse.json(await qb.usageOfMine(user));
    if (sp.get("paper")) {
      // In the Controller's template, through the paper's security (official papers are logged; locked ones refused).
      const { touch, layoutOf } = await import("../../../lib/paperTemplates");
      const id = String(sp.get("paper"));
      const t = await touch(user as never, id, sp.get("format") === "docx" ? "DOWNLOADED" : "PRINTED").catch((e) => { throw Object.assign(e, { status: 403 }); });
      const { l, qs, name } = await layoutOf(id, t.official ? t.watermark : null);
      if (sp.get("format") === "docx") return new NextResponse(await paperDocx(l, qs), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"` } });
      return new NextResponse(Buffer.from(await paperPdf(l, qs)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` } });
    }
    const courseId = String(sp.get("courseId") || "");
    const r = await qb.visibleBank(user, courseId, String(sp.get("q") || ""));
    if (!qb.mayOpen(r.ctx, user)) return NextResponse.json({ error: "Only the course's Subject Expert, its teachers and the Program Lead see this bank." }, { status: 403 });
    const { prisma } = await import("../../../lib/db");
    const names = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(r.items.map((x) => x.authorId))) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
    const practice = Array.from(await (await import("../../../lib/practicePool")).poolFor(r.ctx.chairmanId, r.ctx.codes));
    return NextResponse.json({ practice, items: r.items.map((x) => shape(x, names)), reviewer: qb.isReviewer(r.ctx, user), isSE: r.viewer.isSE, course: { id: r.ctx.course.id, code: r.ctx.course.code, baseId: r.ctx.baseId } });
  } catch (e) { return fail(e); }
}

async function POST_handler(req: NextRequest) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { user } = g;
  try {
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      await qb.requirePin(user.id);
      const f = await req.formData(); const file = f.get("file") as File | null; const courseId = String(f.get("courseId") || "");
      if (!file) throw new Error("Choose the file.");
      if (f.get("kind") === "pdf") {
        if (file.size > 15_000_000) throw new Error("The PDF is larger than 15 MB.");
        return NextResponse.json(await qb.analysePdf(user, courseId, Buffer.from(await file.arrayBuffer())));
      }
      const grids = await readWorkbookGrids(file);
      const grid = ((grids.find((x) => /question/i.test(x.name)) || grids[0])?.grid || []).map((r) => r.map((c) => String(c ?? "")));
      if (f.get("apply")) return NextResponse.json(await qb.sheetImport(user, courseId, grid));
      return NextResponse.json(await qb.sheetPreview(user, courseId, grid));
    }
    const b = await req.json().catch(() => ({}));
    const s = (v: unknown, n = 200) => String(v ?? "").slice(0, n);
    if (b.action === "pinSet") return NextResponse.json(await qb.setPin(user, s(b.pin, 12), s(b.password, 200)));
    if (b.action === "pinVerify") return NextResponse.json(await qb.verifyPin(user, s(b.pin, 12)));
    await qb.requirePin(user.id);
    switch (b.action) {
      case "add": return NextResponse.json(await qb.addItem(user, s(b.courseId, 60), b, { force: !!b.force }));
      case "review": return NextResponse.json(await qb.review(user, s(b.id, 60), b.decision === "REJECT" ? "REJECT" : b.decision === "EDIT" ? "EDIT" : "APPROVE", s(b.note, 1000), b.edits || {}));
      case "share": return NextResponse.json(await qb.share(user, s(b.id, 60), s(b.visibility, 10) as never, Array.isArray(b.sharedWith) ? b.sharedWith.map(String) : []));
      case "code": return NextResponse.json(await qb.createCode(user, (Array.isArray(b.itemIds) ? b.itemIds : []).map(String).slice(0, 200), Number(b.days) || 7, s(b.purpose, 200)));
      case "redeem": return NextResponse.json(await qb.redeemCode(user, s(b.code, 40)));
      case "revoke": return NextResponse.json(await qb.revokeCode(user, s(b.id, 60)));
      case "unlock": return NextResponse.json(await qb.unlock(user, s(b.id, 60), s(b.reason, 500)));
      case "practice": return NextResponse.json(await (await import("../../../lib/practicePool")).setPractice(user, s(b.courseId, 60), s(b.id, 60), !!b.on));
      case "draft": return NextResponse.json(await qb.draft(user, s(b.courseId, 60), b));
      case "variant": return NextResponse.json(await qb.variant(user, s(b.paperId, 60)));
      case "adopt": return NextResponse.json(await qb.adopt(user, s(b.paperId, 60)));
      case "past": return NextResponse.json(await qb.pastPapersToBank(user, s(b.courseId, 60)));
      case "stats": return NextResponse.json({ rows: await qb.refreshStats(s(b.courseId, 60)) });
      case "saveAnalysed": return NextResponse.json(await qb.saveAnalysed(user, s(b.courseId, 60), Array.isArray(b.rows) ? b.rows : []));
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
