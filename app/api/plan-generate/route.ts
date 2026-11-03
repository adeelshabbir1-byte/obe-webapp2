import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import * as pg from "../../../lib/planGen";
import { PdfDoc } from "../../../lib/pdfDoc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  return user as unknown as { id: string; role: string; name: string; managedById?: string | null };
}
const fail = (e: unknown) => { const m = (e as Error).message || "Failed"; return NextResponse.json({ error: m === "forbidden" ? "You can't generate assessments for this course." : m }, { status: m === "forbidden" ? 403 : 400 }); };

export async function GET(req: NextRequest) {
  const u = await guard(); if (!u) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    const paper = sp.get("paper");
    if (paper) {
      const v = await pg.view(u, paper);
      if (sp.get("pdf")) {
        const pdf = await PdfDoc.create(`${v.label} - version ${v.variant}`);
        pdf.title(`${v.label} — version ${v.variant}`, `${v.questions.reduce((a, q) => a + q.marks, 0)} marks · ${v.questions.length} questions`);
        v.questions.forEach((q, i) => pdf.text(`Q${i + 1}. ${q.text}   [${q.marks} marks · ${q.clo}]`, { gap: 8 }));
        return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${v.label.replace(/[^\w-]+/g, "-")}-${v.variant}.pdf"` } });
      }
      return NextResponse.json(v);
    }
    return NextResponse.json(await pg.board(u, String(sp.get("courseId") || "")));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const u = await guard(); if (!u) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const s = (v: unknown, n = 80) => String(v ?? "").slice(0, n);
  try {
    switch (b.action) {
      case "generate": return NextResponse.json(await pg.generate(u, s(b.courseId), { instrumentId: s(b.instrumentId), lectures: Array.isArray(b.lectures) ? b.lectures.map(Number).filter(Number.isFinite).slice(0, 200) : undefined, difficulty: b.difficulty && typeof b.difficulty === "object" ? Object.fromEntries(["EASY", "MEDIUM", "HARD"].map((k) => [k, Math.max(0, Math.min(100, Number(b.difficulty[k]) || 0))])) : undefined, minutes: Number(b.minutes) || undefined, examDate: b.examDate ? s(b.examDate, 20) : null, allSections: !!b.allSections }));
      case "generateAll": return NextResponse.json(await pg.generateAll(u, s(b.courseId), { difficulty: b.difficulty && typeof b.difficulty === "object" ? Object.fromEntries(["EASY", "MEDIUM", "HARD"].map((k) => [k, Math.max(0, Math.min(100, Number(b.difficulty[k]) || 0))])) : undefined, allSections: !!b.allSections }));
      case "swap": return NextResponse.json(await pg.swapOne(u, s(b.paperId), s(b.questionId)));
      case "adopt": return NextResponse.json(await pg.adoptPaper(u, s(b.paperId)));
      case "tutorial": return NextResponse.json(await pg.recordTutorial(u, s(b.courseId), s(b.ga, 12), s(b.note, 1000)));
      case "rebalance": return NextResponse.json(await pg.rebalance(u, s(b.paperId), s(b.ga, 12), Number(b.count) || 1, !!b.apply));
      case "recheck": return NextResponse.json(await pg.recheck(u, s(b.courseId), s(b.cqiId)));
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}
