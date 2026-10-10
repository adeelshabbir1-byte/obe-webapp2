import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { batchForBulkClos, importBulkClos } from "../../../../lib/cloBulk";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const batch = await batchForBulkClos(user, String(form?.get("batchId") || ""));
  if (!batch) return NextResponse.json({ error: "choose a batch you manage" }, { status: 403 });
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file" }, { status: 400 });
  try {
    const result = await importBulkClos({ batchId: batch.id, file, userId: user.id, removeMissing: form?.get("removeMissing") === "1" });
    await writeAuditLog({ actorUserId: user.id, action: "CLOS_BULK_IMPORTED", entityType: "Batch", entityId: batch.id, metadata: { courses: result.coursesDone, added: result.added, updated: result.updated, removed: result.removed, mappings: result.mappingsAdded } });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "could not read that file" }, { status: 400 });
  }
}
