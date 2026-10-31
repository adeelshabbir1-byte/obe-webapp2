import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { withErrors } from "../../../lib/apiHandler";
import { EB_HINT, addQuestion, canView, editQuestion, examOf, imageOf, isTeacher, leadAction, planOf, rate, saveBlueprint, saveDraft, submitDraft, teamFor } from "../../../lib/examBoard";
import type { Team } from "../../../lib/courseTeams";

/**
 * Collaborative exam papers (lib/examBoard.ts).
 *   addQuestion { team | courseCode, text, marks, kind, bloom, difficulty, cloCodes[], lectureNumber, rubric, options[], correctIndex, codeSnippet, image{type,data}, force?, toDraft? }
 *   editQuestion { team | courseCode, id, …same fields, removeImage? }
 *   saveDraft { team, exam, itemIds[] }  ·  submitDraft { team, exam }
 *   rate { team, exam, itemId, stars, comment }
 *   lead { team, exam, op: pick | unpick | remove | add | edit | publish | reopen, slot, itemId, text, marks, note }
 *   blueprint { exam, easyPct, mediumPct, hardPct, tolerancePct, minCloPct, maxCloPct }
 * GET ?image=<itemId> — a question's diagram.
 */
const BANK_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"];
const MISSING = /qbMeta|examDraft|qbRating|examFinal|examBlueprint|questionBankItem|does not exist/;

/** A one-course "team" for the plain question bank (a course taught by one teacher). */
async function codeTeam(user: { id: string; role: string }, chairmanId: string, code: string): Promise<Team | null> {
  const mine = user.role === "INSTRUCTOR" ? { instructorId: user.id } : user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : {};
  const c = await prisma.course.findFirst({ where: { code, coordinator: { managedById: chairmanId }, ...mine }, orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true } });
  return c ? { key: "", code: c.code, title: c.title, term: "", rows: [{ courseId: c.id, batch: "", semester: null, teachers: [], instructorId: null }], teachers: [], leadId: null } : null;
}

async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Please sign in again." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("image") || "";
  const chairmanId = await chairmanIdFor(user);
  const it = await (prisma as unknown as Record<string, any>).questionBankItem.findFirst({ where: { id, chairmanId } }).catch(() => null);
  const img = it ? await imageOf(id) : null;
  if (!img?.imageData || !img.imageType) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(img.imageData, "base64"), { headers: { "Content-Type": img.imageType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Please sign in again." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user);
  const exam = examOf(b.exam);
  try {
    if (b.action === "blueprint") {
      if (!exam) return NextResponse.json({ error: "Choose Midterm or Final." }, { status: 400 });
      await saveBlueprint(user, chairmanId, exam, b);
      return NextResponse.json({ ok: true, message: "Blueprint saved." });
    }
    // The course team (or, for the plain bank, a course with that code).
    let team: Team | null = null;
    if (b.team) {
      team = await teamFor(chairmanId, String(b.team));
      if (!team || !canView(team, user)) return NextResponse.json({ error: "Course team not found." }, { status: 404 });
    } else if (b.courseCode && ["addQuestion", "editQuestion"].includes(b.action)) {
      if (!BANK_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      team = await codeTeam(user, chairmanId, String(b.courseCode).slice(0, 30));
      if (!team) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
    if (!team) return NextResponse.json({ error: "Choose the course team." }, { status: 400 });
    switch (b.action) {
      case "addQuestion": {
        if (b.team && !isTeacher(team, user.id)) return NextResponse.json({ error: "Only the teachers of this course team add to its bank." }, { status: 403 });
        const plan = await planOf(team);
        const r = await addQuestion(user, chairmanId, plan, plan.codes[0] || team.code, b);
        if ("duplicates" in r) return NextResponse.json({ duplicates: r.duplicates });
        if (b.toDraft && exam && b.team) {
          const d = await (prisma as unknown as Record<string, any>).examDraft.findUnique({ where: { chairmanId_teamKey_examType_authorId: { chairmanId, teamKey: team.key, examType: exam, authorId: user.id } } });
          await saveDraft(user, chairmanId, team, exam, [...(d ? (JSON.parse(d.itemIdsJson) as string[]) : []), r.id]);
        }
        return NextResponse.json({ ok: true, id: r.id, message: "Question added to the bank." });
      }
      case "editQuestion": {
        const r = await editQuestion(user, chairmanId, await planOf(team), String(b.id || ""), b);
        return NextResponse.json({ ok: true, message: r.ratingsCleared ? `Saved — ${r.ratingsCleared} rating(s) of the old wording were cleared.` : "Saved." });
      }
      case "saveDraft": {
        if (!exam) return NextResponse.json({ error: "Choose Midterm or Final." }, { status: 400 });
        const c = await saveDraft(user, chairmanId, team, exam, Array.isArray(b.itemIds) ? b.itemIds : []);
        return NextResponse.json({ ok: true, check: c, message: c.ok ? "Draft saved — it meets the blueprint." : "Draft saved — fix the blueprint issues before submitting." });
      }
      case "submitDraft": {
        if (!exam) return NextResponse.json({ error: "Choose Midterm or Final." }, { status: 400 });
        await submitDraft(user, chairmanId, team, exam);
        return NextResponse.json({ ok: true, message: "Submitted — the team can now rate its questions." });
      }
      case "rate": {
        if (!exam) return NextResponse.json({ error: "Choose Midterm or Final." }, { status: 400 });
        await rate(user, chairmanId, team, exam, String(b.itemId || ""), Number(b.stars), String(b.comment || ""));
        return NextResponse.json({ ok: true });
      }
      case "lead": {
        if (!exam) return NextResponse.json({ error: "Choose Midterm or Final." }, { status: 400 });
        await leadAction(user, chairmanId, team, exam, b);
        return NextResponse.json({ ok: true, message: b.op === "publish" ? "Published — every section has the official paper." : "Saved." });
      }
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: MISSING.test(m) ? EB_HINT : m }, { status: 400 });
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
