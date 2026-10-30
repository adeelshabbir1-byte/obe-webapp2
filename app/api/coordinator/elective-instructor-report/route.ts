import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getAvailableTerms } from "../../../../lib/loadReport";
import { getElectiveInstructorReport } from "../../../../lib/electiveInstructorReport";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const terms = await getAvailableTerms(user.id);
  return NextResponse.json({ terms });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const selectedTerms = Array.isArray(body.terms) ? body.terms : [];
  if (selectedTerms.length === 0) return NextResponse.json({ error: "select at least one term" }, { status: 400 });

  const rows = await getElectiveInstructorReport(user.id, selectedTerms);
  return NextResponse.json({ rows });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
