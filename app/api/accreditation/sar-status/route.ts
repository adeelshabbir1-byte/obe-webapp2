import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { sarScope } from "../../../../lib/sarAccess";
import { buildNbeacSar } from "../../../../lib/nbeacSar";
import { chapterHash, itemHash, itemKeys, setItemReady, SAR_STATUS_HINT } from "../../../../lib/sarStatus";
import { prisma } from "../../../../lib/db";
import { govScope, inScope } from "../../../../lib/accreditation/governance";
import { sarData, sarGaps, chapters } from "../../../../lib/sarBuilder";
import { withErrors } from "../../../../lib/apiHandler";

// Mark one NBEAC SAR table ready (approved as it stands) or open it again. Ready is given by the department's
// managers: the Institute Head, Dean, Chairman (HOD), Department Coordinator and the Program Lead.
const APPROVERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];

// A chapter of a visit cycle's SAR (NCEAC / PEC / HEC): the cycle's managers and its Program Lead.
async function cycleChapter(user: { id: string; name: string; role: string; managedById: string | null }, cycleId: string, key: string, ready: boolean) {
  const s = await govScope(user as Parameters<typeof govScope>[0]);
  const c = await prisma.accreditationCycle.findUnique({ where: { id: cycleId } }).catch(() => null);
  if (!s || !c || !inScope(s, c) || !(s.canManage || c.leadId === user.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = await sarData(c.id);
  if (!d || !chapters(d.body).some((x) => x.key === key)) return NextResponse.json({ error: "No such chapter." }, { status: 404 });
  const mine = sarGaps(d).filter((g) => g.ch === key && !g.text.startsWith("Narrative")).map((g) => g.text);
  try { await setItemReady(c.id, d.body, key, ready ? chapterHash(d.narr.get(key) || "", mine) : null, { id: user.id, name: user.name }); }
  catch { return NextResponse.json({ error: SAR_STATUS_HINT }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.cycle) return cycleChapter(user, String(b.cycle), String(b.item || ""), !!b.ready);
  if (!APPROVERS.includes(user.role)) return NextResponse.json({ error: "Only the department's managers can mark a table ready." }, { status: 403 });
  const deptId = String(b.dept || ""), key = String(b.item || ""), ready = !!b.ready;
  const scope = await sarScope(user);
  if (!scope.departments.some((d) => d.id === deptId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const doc = await buildNbeacSar(user, scope, deptId);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const keys = itemKeys(doc);
  const item = Array.from(keys.entries()).find(([, k]) => k === key)?.[0];
  if (!item) return NextResponse.json({ error: "No such table." }, { status: 404 });
  if (ready && item.status !== "filled") return NextResponse.json({ error: "This table has no data yet — it can't be marked ready." }, { status: 400 });
  try { await setItemReady(deptId, "NBEAC", key, ready ? itemHash(item) : null, { id: user.id, name: user.name }); }
  catch { return NextResponse.json({ error: SAR_STATUS_HINT }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
