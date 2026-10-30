import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { uploadHistory, UPLOAD_COLUMNS, PRED_HINT } from "../../../lib/prediction";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 60;
const MANAGERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC"];

// GET — the upload template. POST_handler (text/csv body) — past years' results.
async function GET_handler() {
  const sample = ["BSCS,2018,BSCS-18-001,1,Fall,2018,CS101,3,78,92,B+,3.33,GRADUATED", "BSCS,2018,BSCS-18-001,1,Fall,2018,MT101,3,45,70,F,0,GRADUATED", "BSCS,2018,BSCS-18-002,1,Fall,2018,CS101,3,62,85,C+,2.33,DROPPED"];
  return new NextResponse([UPLOAD_COLUMNS.join(","), ...sample].join("\n") + "\n", { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="past-results-template.csv"' } });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const text = await req.text();
  if (text.length > 15_000_000) return NextResponse.json({ error: "File too large — split it by intake year." }, { status: 400 });
  try { return NextResponse.json(await uploadHistory(await chairmanIdFor(user), text)); }
  catch (e) { const m = e instanceof Error ? e.message : ""; return NextResponse.json({ error: /column|rows/.test(m) ? m : PRED_HINT }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
