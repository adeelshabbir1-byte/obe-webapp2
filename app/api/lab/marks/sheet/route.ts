import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { labAccessFor } from "../../../../../lib/labAccess";
import { labMarksWorkbook } from "../../../../../lib/labMarksSheet";

/** GET ?courseId= — the lab marks sheet: the class, one column per lab, filled with marks already entered. */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  const courseId = new URL(req.url).searchParams.get("courseId") || "";
  const access = user ? await labAccessFor(user, courseId) : null;
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const buf = await labMarksWorkbook(access.lab);
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${access.lab.code} lab marks.xlsx"` } });
}
