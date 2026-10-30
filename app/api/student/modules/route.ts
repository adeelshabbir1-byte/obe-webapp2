import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { instituteOfBatch, lockedModules } from "../../../../lib/moduleLocks";
import { withErrors } from "../../../../lib/apiHandler";

/** GET — the modules switched off for the signed-in student's institute (the portal hides their links). */
async function GET_handler() {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ locked: [] });
  const locked = await lockedModules(await instituteOfBatch((s as { batchId: string }).batchId).catch(() => null));
  return NextResponse.json({ locked: Array.from(locked) });
}
export const GET = withErrors(GET_handler);
