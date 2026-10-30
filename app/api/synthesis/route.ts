import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { prisma } from "../../../lib/db";
import { canBuild } from "../../../lib/curriculumBuilder";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import { applySynthesis, partsFromText, preview, submitProposal } from "../../../lib/synthesis";
import type { Picks } from "../../../lib/synthesisCore";

const db = prisma as unknown as Record<string, any>;
const SYNTH = ["SUPER_USER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "OMC"];
/**
 * POST { action, masterCourseId, ... }
 *   propose { description, clos, topics, labPlan, assessments, books, note }  — SMEs and teachers (anyone who can open the curriculum)
 *   preview { picks }  apply { picks }                                          — Program Lead / committee lead (or the HEC builder)
 *   justify { curriculumId, text }                                              — the institute's justification for a yellow copy
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "justify") {
      const c = await prisma.masterCurriculum.findUnique({ where: { id: String(b.curriculumId || "") }, select: { id: true, chairmanId: true } });
      if (!c?.chairmanId || c.chairmanId !== (await findOwningChairmanId(user.id).catch(() => null)) || !["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC"].includes(user.role)) throw new Error("Only the institute's leads justify its curriculum.");
      const text = String(b.text || "").trim();
      if (text.length < 20) throw new Error("Write the justification (at least a sentence).");
      await db.curriculumJustification.upsert({ where: { curriculumId: c.id }, create: { curriculumId: c.id, text: text.slice(0, 3000), byId: user.id }, update: { text: text.slice(0, 3000), byId: user.id, at: new Date() } });
      return NextResponse.json({ ok: true });
    }
    const mc = await prisma.masterCourse.findUnique({ where: { id: String(b.masterCourseId || "") }, select: { id: true, masterCurriculum: { select: { id: true, chairmanId: true, authority: true, title: true, status: true } } } });
    if (!mc) throw new Error("Course not found.");
    const cur = mc.masterCurriculum;
    const mine = cur.chairmanId === null || cur.chairmanId === (await findOwningChairmanId(user.id).catch(() => null));
    if (!mine && user.role !== "SUPER_USER") throw new Error("Not your curriculum.");
    if (b.action === "propose") return NextResponse.json({ ok: true, id: await submitProposal(user, mc.id, partsFromText(b), String(b.note || "")), message: "Proposal submitted." });
    const picks = b.picks as Picks;
    if (b.action === "preview") return NextResponse.json({ ok: true, ...(await preview(mc.id, picks)) });
    if (b.action === "apply") {
      const may = cur.chairmanId === null ? await canBuild(user as never, cur) : SYNTH.includes(user.role);
      if (!may) throw new Error("The Program Lead or the committee lead synthesizes the final course.");
      if (cur.chairmanId === null && cur.status === "PUBLISHED") throw new Error("A published Golden Copy is read-only — start a new revision.");
      await applySynthesis(user, mc.id, picks);
      return NextResponse.json({ ok: true, message: "The master course now holds the synthesized content." });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
