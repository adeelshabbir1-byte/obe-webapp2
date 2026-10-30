import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { checkDatabase, fixScript } from "../../../../lib/systemHealth";
import { adminCan } from "../../../../lib/platformTeam";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET — the fix script as a .sql download (Super User only).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "SECURITY"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await checkDatabase();
  const sql = fixScript(r.issues) || "-- Nothing to fix: the database matches the app.\nSELECT 'done' AS result;\n";
  return new NextResponse(sql, { headers: { "Content-Type": "application/sql; charset=utf-8", "Content-Disposition": `attachment; filename="system_health_fix_${new Date().toISOString().slice(0, 10)}.sql"` } });
}
export const GET = withErrors(GET_handler);
