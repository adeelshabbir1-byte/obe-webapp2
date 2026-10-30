import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { bdb, BUILDER_HINT } from "../../../../lib/curriculumBuilder";
import { withErrors } from "../../../../lib/apiHandler";

// POST { userId, on, councils: "NCEAC, NBEAC", programs: "" } — make a platform expert a Curriculum Builder (or not).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const u = await prisma.user.findFirst({ where: { id: String(b.userId || ""), isPlatformExpert: true }, select: { id: true, extraRoles: true, name: true } });
  if (!u) return NextResponse.json({ error: "Choose a platform expert." }, { status: 400 });
  const list = (v: unknown) => JSON.stringify(String(v || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20));
  try {
    const roles = new Set(u.extraRoles || []);
    if (b.on === false) { await bdb.curriculumBuilderScope.deleteMany({ where: { userId: u.id } }); roles.delete("CURRICULUM_BUILDER"); }
    else { await bdb.curriculumBuilderScope.upsert({ where: { userId: u.id }, create: { userId: u.id, councilsJson: list(b.councils), programsJson: list(b.programs), createdById: user.id }, update: { councilsJson: list(b.councils), programsJson: list(b.programs) } }); roles.add("CURRICULUM_BUILDER"); }
    await prisma.user.update({ where: { id: u.id }, data: { extraRoles: Array.from(roles) } });
    await writeAuditLog({ actorUserId: user.id, action: b.on === false ? "CURRICULUM_BUILDER_REMOVED" : "CURRICULUM_BUILDER_SET", entityType: "User", entityId: u.id });
    return NextResponse.json({ ok: true, message: b.on === false ? `${u.name} is no longer a Curriculum Builder.` : `${u.name} can now build curricula.` });
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /curriculumBuilderScope|does not exist/.test(m) ? BUILDER_HINT : m }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
