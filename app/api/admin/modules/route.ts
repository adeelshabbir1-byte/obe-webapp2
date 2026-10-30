import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { MODULE_KEYS, PACKAGES } from "../../../../lib/modules";
import { forgetLocks } from "../../../../lib/moduleLocks";
import { adminCan } from "../../../../lib/platformTeam";
import { withErrors } from "../../../../lib/apiHandler";

const mdb = prisma as unknown as Record<string, any>;

// POST { chairmanId, on: string[] (modules switched on), packageKey?, note?, validUntil? } — Super User only.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "BILLING"))) return NextResponse.json({ error: "Only the Super User sets institute modules." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = String(b.chairmanId || "");
  const inst = await prisma.user.findFirst({ where: { id: chairmanId, role: "CHAIRMAN" }, select: { id: true, name: true } });
  if (!inst) return NextResponse.json({ error: "Institute not found." }, { status: 404 });
  const on = new Set((Array.isArray(b.on) ? b.on : []).map(String));
  const locked = MODULE_KEYS.filter((k) => !on.has(k));
  const packageKey = PACKAGES.some((x) => x.key === b.packageKey) ? String(b.packageKey) : null;
  const vu = b.validUntil ? new Date(String(b.validUntil)) : null;
  const programs = Array.from(new Set((Array.isArray(b.programs) ? b.programs : []).map((x: unknown) => String(x).trim()).filter(Boolean))).slice(0, 100);
  const data = { lockedJson: JSON.stringify(locked), programsJson: JSON.stringify(programs), packageKey, note: typeof b.note === "string" ? b.note.slice(0, 1000) : null, validUntil: vu && !isNaN(vu.getTime()) ? vu : null, updatedById: user.id, updatedAt: new Date() };
  try {
    await mdb.instituteLicense.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data, select: { chairmanId: true } });
  } catch { return NextResponse.json({ error: "Not set up yet — run prisma/migration_modules.sql in Supabase (again, if you ran it before 18 Oct: it now adds licensed programs)." }, { status: 500 }); }
  forgetLocks(chairmanId);
  await writeAuditLog({ actorUserId: user.id, action: "INSTITUTE_MODULES_SET", entityType: "User", entityId: chairmanId, metadata: { locked: locked.join(", "), programs: programs.join(", "), packageKey: packageKey || "" } });
  return NextResponse.json({ ok: true, locked: locked.length });
}
export const POST = withErrors(POST_handler);
