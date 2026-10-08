import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { loadMoveData, moveProgram } from "../../../lib/programMove";

// The Chairman (for his department) or the Institute Head (whole institute) hands a program's existing batches over to its Program Lead.
function scopeOf(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }) {
  if (user.role === "CHAIRMAN") return { chairmanId: user.id, departmentId: null as string | null };
  if (user.role === "HEAD_OF_DEPARTMENT" && user.departmentId && user.managedById) return { chairmanId: user.managedById, departmentId: user.departmentId };
  return null;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  const scope = user && scopeOf(user);
  if (!scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await loadMoveData(scope));
}

// body: { sourceId, program, targetId }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const scope = user && scopeOf(user);
  if (!user || !scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.sourceId || !body.program || !body.targetId) return NextResponse.json({ error: "sourceId, program and targetId are required" }, { status: 400 });

  const data = await loadMoveData(scope);
  if (!data.groups.some((g) => g.sourceId === body.sourceId && g.program === body.program)) return NextResponse.json({ error: "that program is not in your scope" }, { status: 404 });
  if (!data.leads.some((l) => l.id === body.targetId)) return NextResponse.json({ error: "that person is not a Program Lead you can choose" }, { status: 400 });

  try {
    const r = await moveProgram(body.sourceId, body.program, body.targetId);
    await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_DATA_MOVED", entityType: "User", entityId: body.targetId, metadata: { program: body.program, fromUserId: body.sourceId, batches: r.batches, courses: r.courses, students: r.students } });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not move" }, { status: 409 });
  }
}
