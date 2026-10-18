import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { instituteOfBatch, lockedModules } from "../../../../lib/moduleLocks";

/** GET — the modules switched off for the signed-in student's institute (the portal hides their links). */
export async function GET() {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ locked: [] });
  const locked = await lockedModules(await instituteOfBatch((s as { batchId: string }).batchId).catch(() => null));
  return NextResponse.json({ locked: Array.from(locked) });
}
