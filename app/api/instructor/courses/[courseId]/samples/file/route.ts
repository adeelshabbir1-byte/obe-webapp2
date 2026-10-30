import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { pdb } from "../../../../../../../lib/portfolio";
import { readStored } from "../../../../../../../lib/sampleStorage";
import { canSeeSamples } from "../../../../../../../lib/samplesPdf";
import { withErrors } from "../../../../../../../lib/apiHandler";

// A sampled script, from private storage, for people allowed to see the course (never a public link).
async function GET_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await canSeeSamples(user, params.courseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await pdb.studentWorkSample.findFirst({ where: { id: req.nextUrl.searchParams.get("id") || "", courseId: params.courseId } });
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const f = await readStored(s.fileUrl);
  if (!f) return NextResponse.json({ error: "The file could not be read from storage." }, { status: 404 });
  return new NextResponse(new Uint8Array(f.buf), { headers: { "Content-Type": f.type, "Content-Disposition": `inline; filename="${String(s.fileName).replace(/[^A-Za-z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store" } });
}
export const GET = withErrors(GET_handler);
