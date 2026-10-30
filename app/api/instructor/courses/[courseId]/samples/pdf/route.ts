import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { canSeeSamples, samplesPdf } from "../../../../../../../lib/samplesPdf";
import { withErrors } from "../../../../../../../lib/apiHandler";

export const maxDuration = 60;

// GET ?instrumentId=…&names=1 — the course-file samples PDF (one assessment, or the whole course). Names only on request.
async function GET_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await canSeeSamples(user, params.courseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const { bytes, name } = await samplesPdf(params.courseId, { instrumentId: sp.get("instrumentId"), names: sp.get("names") === "1" });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` } });
}
export const GET = withErrors(GET_handler);
