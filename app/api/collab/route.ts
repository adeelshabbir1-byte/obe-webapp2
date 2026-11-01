import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { ASSIGNERS, assignOwner, canWork, createProg, draftCem, saveData, saveModes, type Prog } from "../../../lib/collab";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];

// POST { action: create {kind, title} | save {id, data, status?} | cem {id, ours, theirs} | assign {id, userId} }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (b.action === "create" && !ROLES.includes(user.role)) return NextResponse.json({ error: "Only the Dean, Institute Head, HOD or Program Lead start a programme." }, { status: 403 });
    if (b.action === "create") return NextResponse.json({ id: await createProg(user, cid, String(b.kind), String(b.title || "New programme")) });
    const p = (await db.collabProgramme.findUnique({ where: { id: String(b.id) } })) as Prog | null;
    if (!p || p.chairmanId !== cid || !(await canWork(user, p))) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (b.action === "assign") {
      if (!ASSIGNERS.includes(user.role)) return NextResponse.json({ error: "Only the Dean or the Institute Head assigns a programme." }, { status: 403 });
      const to = b.userId ? await prisma.user.findUnique({ where: { id: String(b.userId) }, select: { id: true, name: true } }) : null;
      await assignOwner(user, p, to?.id || "", to?.name || ""); return NextResponse.json({ ok: true });
    }
    if (b.action === "save") { await saveData(p, b.data || {}, b.status); return NextResponse.json({ ok: true }); }
    if (b.action === "modes") return NextResponse.json({ ok: true, pct: await saveModes(p, user.id, String(b.courseId), String(b.code), b.modes || {}) });
    if (b.action === "cem") { const cem = await draftCem(String(b.ours), String(b.theirs)); await saveData(p, { cem }); return NextResponse.json({ ok: true, lines: cem.length }); }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
