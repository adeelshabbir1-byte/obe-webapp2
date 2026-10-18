import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { isCouncilKey } from "../../../lib/councilAttributes";
import { autoMap, GA_MAP_EDITORS, GA_MAP_HINT, loadSet, mapBatches, saveMap } from "../../../lib/gaCouncilMap";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";

// POST { action: "map", batchId, ploId, body, attrs: number[] } | { action: "load" | "auto", batchId, body }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !GA_MAP_EDITORS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batchId = String(b.batchId || ""), body = String(b.body || "");
  if (!isCouncilKey(body)) return NextResponse.json({ error: "Unknown council." }, { status: 400 });
  if (!(await mapBatches(user)).some((x) => x.id === batchId)) return NextResponse.json({ error: "Not your batch." }, { status: 403 });
  try {
    if (b.action === "map") {
      const plo = await prisma.pLO.findFirst({ where: { id: String(b.ploId || ""), batchId }, select: { id: true } });
      if (!plo) return NextResponse.json({ error: "No such GA." }, { status: 404 });
      await saveMap(batchId, plo.id, body, Array.isArray(b.attrs) ? b.attrs.map(Number) : [], user.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "auto") return NextResponse.json({ mapped: await autoMap(batchId, body, user.id) });
    if (b.action === "load") {
      const r = await loadSet(batchId, body, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "GAS_LOADED_FROM_COUNCIL", entityType: "Batch", entityId: batchId, metadata: { body, ...r } });
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("ga-council-map", e);
    return NextResponse.json({ error: GA_MAP_HINT }, { status: 500 });
  }
}
