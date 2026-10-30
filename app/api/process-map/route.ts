import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { titlesFor } from "../../../lib/titles";
import { processMapWorkbook } from "../../../lib/processMapExcel";
import { withErrors } from "../../../lib/apiHandler";


// GET [?role=PL] — the process map as a coloured Excel sheet.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const t = await titlesFor(await chairmanIdFor(user).catch(() => null));
  const roleF = req.nextUrl.searchParams.get("role");
  const wb = processMapWorkbook(t, roleF);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="OBEHUB process map${roleF ? ` - ${roleF}` : ""}.xlsx"` } });
}
export const GET = withErrors(GET_handler);
