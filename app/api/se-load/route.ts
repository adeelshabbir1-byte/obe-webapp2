import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { seLimitFor, seLoads } from "../../../lib/seNaming";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET — every Subject Expert's live SE load in the institute (base courses only) and this person's limit (Adeel prompt §35).
// Polled by the assignment pages every few seconds, so a choice made anywhere shows everywhere.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "OMC", "DEAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const [loads, limit] = await Promise.all([seLoads(cid), seLimitFor(user as never)]);
  return NextResponse.json({ loads, limit });
}
export const GET = withErrors(GET_handler);
