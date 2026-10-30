import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { saveDetail } from "../../../../lib/aas";
import { STUDENT_SELF, checkValues, canonValues } from "../../../../lib/aasFields";
import { portalLists } from "../../../../lib/nceacPortal";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

/** POST — the signed-in student saves their own details (the fields NCEAC's Student Directory asks for). */
async function POST_handler(req: Request) {
  const s = await getAuthenticatedStudent();
  if (!s) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  // The institute's corrected NCEAC lists, and the portal's spelling of what was chosen.
  const bt = await prisma.batch.findUnique({ where: { id: s.batchId }, select: { coordinator: { select: { managedById: true } } } }).catch(() => null);
  const lists = await portalLists(bt?.coordinator?.managedById);
  const v = canonValues("student", Object.fromEntries(STUDENT_SELF.map((k) => [k, typeof b[k] === "string" ? b[k] : ""])), lists);
  const bad = checkValues("student", v, lists);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try { await saveDetail("student", s.id, v, s.id); } catch { return NextResponse.json({ error: "Not set up yet — ask your Program Lead (database update pending)." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
