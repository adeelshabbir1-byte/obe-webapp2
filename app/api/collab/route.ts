import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { createProg, draftCem, saveData, type Prog } from "../../../lib/collab";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];

// POST { action: create {kind, title} | save {id, data, status?} | cem {id, ours, theirs} }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (b.action === "create") return NextResponse.json({ id: await createProg(user, cid, String(b.kind), String(b.title || "New programme")) });
    const p = (await db.collabProgramme.findUnique({ where: { id: String(b.id) } })) as Prog | null;
    if (!p || p.chairmanId !== cid) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (b.action === "save") { await saveData(p, b.data || {}, b.status); return NextResponse.json({ ok: true }); }
    if (b.action === "cem") { const cem = await draftCem(String(b.ours), String(b.theirs)); await saveData(p, { cem }); return NextResponse.json({ ok: true, lines: cem.length }); }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
