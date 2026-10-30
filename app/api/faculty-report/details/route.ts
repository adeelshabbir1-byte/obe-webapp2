import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { buildExcelResponse } from "../../../../lib/excelExport";
import { reportPeople } from "../../../../lib/facultyProfile";
import { withErrors } from "../../../../lib/apiHandler";

// Faculty details as an Excel sheet to fill in, and its upload. The upload fills ONLY empty fields: anything already
// there (e.g. what the teacher entered in My Profile) is never overwritten. People are matched by email, then CNIC,
// then employee code.
const FIELDS: [key: string, header: string, kind?: "date"][] = [
  ["designation", "Designation"], ["employmentType", "Employment (Permanent / Contract / Visiting / Part-time)"], ["employeeCode", "Employee code"],
  ["dateOfJoining", "Date of joining (YYYY-MM-DD)", "date"], ["cnic", "CNIC"], ["phone", "Phone"], ["specialization", "Specialisation"], ["gender", "Gender"],
  ["bloodGroup", "Blood group"], ["officeHours", "Office hours"], ["address", "Address"], ["affiliation", "Organisation (visiting)"],
  ["nextOfKinName", "Next of kin"], ["nextOfKinRelation", "Next of kin relation"], ["nextOfKinPhone", "Next of kin phone"],
];
const d = (x: Date | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "");

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const people = await reportPeople(user);
  if (!people.length) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const profs = await prisma.facultyProfile.findMany({ where: { userId: { in: people.map((p) => p.id) } } });
  const of = new Map(profs.map((p) => [p.userId, p as unknown as Record<string, unknown>]));
  return buildExcelResponse("faculty-details-to-fill.xlsx", [{
    name: "Faculty details",
    columns: [{ header: "Email (do not change)", key: "email", width: 30 }, { header: "Name", key: "name", width: 26 }, ...FIELDS.map(([k, h]) => ({ header: h, key: k, width: 20 }))],
    rows: people.map((p) => { const pr = of.get(p.id) || {}; return { email: p.email, name: p.name, ...Object.fromEntries(FIELDS.map(([k, , t]) => [k, t === "date" ? d(pr[k] as Date) : (pr[k] as string) || ""])) }; }),
  }]);
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const people = await reportPeople(user);
  if (!people.length) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await req.formData()).get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Choose the Excel file." }, { status: 400 });
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never); } catch { return NextResponse.json({ error: "That is not an Excel (.xlsx) file." }, { status: 400 }); }
  const ws = wb.worksheets[0];
  const grid: string[][] = [];
  ws.eachRow((row) => { const cells: string[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { const v = c.value instanceof Date ? c.value.toISOString().slice(0, 10) : (c.text || "").trim(); cells[i - 1] = v; }); grid.push(cells); });
  const head = (grid.shift() || []).map((h) => h.toLowerCase());
  const col = (label: string) => head.findIndex((h) => h.startsWith(label.toLowerCase().split(" (")[0]));
  const iEmail = col("Email"), iCnic = col("CNIC"), iCode = col("Employee code");
  const profs = await prisma.facultyProfile.findMany({ where: { userId: { in: people.map((p) => p.id) } } });
  const byUser = new Map(profs.map((p) => [p.userId, p as unknown as Record<string, unknown>]));
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.id]));
  const byCnic = new Map(profs.filter((p) => p.cnic).map((p) => [String(p.cnic).replace(/\D/g, ""), p.userId]));
  const byCode = new Map(profs.filter((p) => p.employeeCode).map((p) => [String(p.employeeCode).toLowerCase(), p.userId]));
  let filled = 0, kept = 0, people_ = 0; const unmatched: string[] = [];
  for (const r of grid) {
    if (!r.some(Boolean)) continue;
    const uid = (iEmail >= 0 && byEmail.get((r[iEmail] || "").toLowerCase())) || (iCnic >= 0 && byCnic.get((r[iCnic] || "").replace(/\D/g, ""))) || (iCode >= 0 && byCode.get((r[iCode] || "").toLowerCase())) || null;
    if (!uid) { unmatched.push(r[iEmail] || r[1] || "?"); continue; }
    const cur = byUser.get(uid) || {};
    const data: Record<string, unknown> = {};
    for (const [k, h, t] of FIELDS) {
      const i = col(h); if (i < 0) continue;
      const v = (r[i] || "").trim(); if (!v) continue;
      const has = cur[k] !== null && cur[k] !== undefined && String(cur[k]).trim() !== "";
      if (has) { kept++; continue; }
      if (t === "date") { const dt = new Date(v); if (isNaN(dt.getTime())) continue; data[k] = dt; } else data[k] = v.slice(0, 500);
    }
    if (Object.keys(data).length) {
      await prisma.facultyProfile.upsert({ where: { userId: uid }, create: { userId: uid, ...data }, update: data });
      filled += Object.keys(data).length; people_++;
    }
  }
  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_DETAILS_UPLOADED", entityType: "User", entityId: user.id, metadata: { filled, kept, people: people_, unmatched: unmatched.length } });
  return NextResponse.json({ ok: true, message: `Filled ${filled} empty field(s) for ${people_} people. ${kept} field(s) already had a value and were left as they are.${unmatched.length ? ` ${unmatched.length} row(s) matched no one: ${unmatched.slice(0, 6).join(", ")}${unmatched.length > 6 ? "…" : ""}.` : ""}` });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
