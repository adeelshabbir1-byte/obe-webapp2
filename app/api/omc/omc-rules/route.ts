import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { openRound, giveOpinion, finaliseCategory, savePanel, deletePanel, HEADS } from "../../../../lib/omcRules";
import { withErrors } from "../../../../lib/apiHandler";

function figuresFrom(b: Record<string, unknown>) {
  const f: Record<string, unknown> = { minQuizzes: b.minQuizzes, minAssignments: b.minAssignments };
  for (const h of HEADS) { f[`${h}Min`] = b[`${h}Min`]; f[`${h}Max`] = b[`${h}Max`]; }
  return f;
}

/**
 * POST { action, ... } — OMC members; opening, finalising and panels are the Convener's.
 *   open { categories: "ALL" | "CORE,LAB" }    opinion { category, quizMin, quizMax, …, minQuizzes, minAssignments, comment }
 *   finalise { category, figures as above }    panel { id?, term, label, courses (codes, comma separated), member1..3 }    deletePanel { id }
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "OMC") return NextResponse.json({ error: "Only OMC members." }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const me = { id: user.realUserId || user.id, name: user.name };
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "open": {
        const raw = String(b.categories || "ALL");
        const cats = raw === "ALL" ? ["CORE", "LAB", "GE", "CAPSTONE", "ELECTIVE"] : raw.split(",").map((x) => x.trim()).filter(Boolean);
        await openRound(me, chairmanId, cats);
        return NextResponse.json({ ok: true, message: "Opened for the members' opinions." });
      }
      case "opinion": await giveOpinion(me, chairmanId, String(b.category || ""), figuresFrom(b), String(b.comment || "")); return NextResponse.json({ ok: true, message: "Your opinion is saved." });
      case "finalise": await finaliseCategory(me, chairmanId, String(b.category || ""), figuresFrom(b)); return NextResponse.json({ ok: true, message: "Finalised and locked." });
      case "panel": {
        const codes = String(b.courses || "").split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
        const courses = codes.length ? await prisma.course.findMany({ where: { code: { in: codes, mode: "insensitive" }, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, offeredTermName: true, offeredTermYear: true } }) : [];
        const term = String(b.term || "").trim();
        const pick = courses.filter((c) => !c.offeredTermName || `${c.offeredTermName} ${c.offeredTermYear || ""}`.trim() === term || !term);
        const missing = codes.filter((c) => !pick.some((x) => x.code.toUpperCase() === c));
        if (missing.length) return NextResponse.json({ error: `Not found: ${missing.join(", ")}.` }, { status: 400 });
        const members = Array.from(new Set([b.member1, b.member2, b.member3].map((x) => String(x || "")).filter(Boolean)));
        await savePanel(me, chairmanId, { id: b.id ? String(b.id) : undefined, term, label: String(b.label || ""), courseIds: pick.map((c) => c.id), memberIds: members, departmentId: user.departmentId || null });
        return NextResponse.json({ ok: true, message: `Panel saved for ${pick.length} course offering(s).` });
      }
      case "deletePanel": await deletePanel(me, chairmanId, String(b.id || "")); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
