import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { instituteOf, REVIEW_ROLES } from "../../../../lib/quality";
import { qecWorkbook, leadsFor } from "../../../../lib/qecPack";

/** GET — the QEC proforma pack as one Excel workbook (summary plus a sheet per proforma the system holds). */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !REVIEW_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await instituteOf(user);
  if (!cid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const buf = await qecWorkbook(cid, await leadsFor(user, cid));
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="QEC proformas ${new Date().toISOString().slice(0, 10)}.xlsx"` } });
}
