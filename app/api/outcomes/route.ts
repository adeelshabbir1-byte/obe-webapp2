import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";

const int = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const txt = (v: unknown, max = 3000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
export const SURVEY_KINDS = ["STUDENT", "EXIT", "ALUMNI", "EMPLOYER", "COURSE"];

// Program Lead records yearly figures (type "FIGURES") or a survey result (type "SURVEY"); DELETE ?type=&id=
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "only a Program Lead can record these" }, { status: 403 });
  const chairmanId = user.managedById || "none";
  const b = await req.json().catch(() => ({}));
  if (b.type === "FIGURES") {
    const year = int(b.intakeYear);
    if (year < 1990 || year > 2100) return NextResponse.json({ error: "Enter the intake year, for example 2021" }, { status: 400 });
    const admitted = int(b.admitted), graduated = int(b.graduated), onTime = int(b.graduatedOnTime), dropped = int(b.droppedOut);
    if (graduated > admitted || dropped > admitted) return NextResponse.json({ error: "Graduated and dropped out cannot be more than admitted" }, { status: 400 });
    if (onTime > graduated) return NextResponse.json({ error: "Graduated on time cannot be more than graduated" }, { status: 400 });
    const data = { admitted, graduated, graduatedOnTime: onTime, droppedOut: dropped, employedOrStudying: b.employedOrStudying === "" || b.employedOrStudying == null ? null : int(b.employedOrStudying), notes: txt(b.notes, 500), updatedById: user.id };
    await prisma.outcomeFigure.upsert({ where: { leadId_intakeYear: { leadId: user.id, intakeYear: year } } as never, create: { chairmanId, leadId: user.id, intakeYear: year, ...data } as never, update: data as never });
    return NextResponse.json({ ok: true });
  }
  if (b.type === "SURVEY") {
    if (!SURVEY_KINDS.includes(b.kind)) return NextResponse.json({ error: "Choose the kind of survey" }, { status: 400 });
    const when = new Date(b.surveyDate);
    if (isNaN(when.getTime())) return NextResponse.json({ error: "Enter the date of the survey" }, { status: 400 });
    const respondents = int(b.respondents);
    const invited = b.invited === "" || b.invited == null ? null : int(b.invited);
    const rating = b.avgRating === "" || b.avgRating == null ? null : Number(b.avgRating);
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) return NextResponse.json({ error: "Average rating must be between 0 and 5" }, { status: 400 });
    if (invited !== null && respondents > invited) return NextResponse.json({ error: "Respondents cannot be more than those invited" }, { status: 400 });
    await prisma.surveyResult.create({ data: { chairmanId, leadId: user.id, kind: b.kind, surveyDate: when, respondents, invited, avgRating: rating, findings: txt(b.findings), actionTaken: txt(b.actionTaken), createdById: user.id } as never });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown request" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const type = req.nextUrl.searchParams.get("type");
  const r = type === "SURVEY" ? await prisma.surveyResult.deleteMany({ where: { id, leadId: user.id } as never }) : await prisma.outcomeFigure.deleteMany({ where: { id, leadId: user.id } as never });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
