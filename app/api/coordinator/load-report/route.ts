import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getAvailableTerms, getTeacherLoadReport } from "../../../../lib/loadReport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const terms = await getAvailableTerms(user.id);
  return NextResponse.json({ terms });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const selectedTerms = Array.isArray(body.terms) ? body.terms : [];
  if (selectedTerms.length === 0) return NextResponse.json({ error: "select at least one term" }, { status: 400 });

  const rows = await getTeacherLoadReport(user.id, selectedTerms);
  return NextResponse.json({ rows });
}
