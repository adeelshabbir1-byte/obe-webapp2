import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

function cellStr(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}
function cellNum(row: ExcelJS.Row, col: number): number | null {
  const s = cellStr(row, col);
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}
function cellDate(row: ExcelJS.Row, col: number): Date | null {
  const s = cellStr(row, col);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const summary = { alumniCreated: 0, employersCreated: 0, employmentCreated: 0, degreesCreated: 0, errors: [] as string[] };

  // ---- Alumni ----
  const alumniSheet = workbook.getWorksheet("Alumni");
  if (alumniSheet) {
    for (let r = 3; r <= alumniSheet.rowCount; r++) {
      const row = alumniSheet.getRow(r);
      const rollNumber = cellStr(row, 1);
      if (!rollNumber) continue;
      try {
        const existing = await prisma.alumni.findUnique({ where: { chairmanId_rollNumber: { chairmanId, rollNumber } } });
        if (existing) continue; // already exists, skip rather than error
        await prisma.alumni.create({
          data: {
            chairmanId, rollNumber, name: cellStr(row, 2) || rollNumber, email: cellStr(row, 3) || null,
            degreeProgram: cellStr(row, 4) || "—", graduationYear: cellNum(row, 5) || new Date().getFullYear(),
            totalWorkExperienceYears: cellNum(row, 6), addedById: user.id, status: "PENDING",
          },
        });
        summary.alumniCreated++;
      } catch (err: any) { summary.errors.push(`Alumni row ${r} (${rollNumber}): ${err.message || "failed"}`); }
    }
  }

  // ---- Employers ----
  const employersSheet = workbook.getWorksheet("Employers");
  if (employersSheet) {
    for (let r = 3; r <= employersSheet.rowCount; r++) {
      const row = employersSheet.getRow(r);
      const orgName = cellStr(row, 1);
      if (!orgName) continue;
      try {
        const existing = await prisma.employer.findUnique({ where: { chairmanId_organizationName: { chairmanId, organizationName: orgName } } });
        if (existing) continue;
        await prisma.employer.create({
          data: {
            chairmanId, organizationName: orgName, contactName: cellStr(row, 2) || null, contactEmail: cellStr(row, 3) || null,
            companySize: cellStr(row, 4) || null, industryType: cellStr(row, 5) || null, addedById: user.id, status: "PENDING",
          },
        });
        summary.employersCreated++;
      } catch (err: any) { summary.errors.push(`Employer row ${r} (${orgName}): ${err.message || "failed"}`); }
    }
  }

  // ---- Employment (depends on Alumni + Employers existing, including ones just created above) ----
  const employmentSheet = workbook.getWorksheet("Employment");
  if (employmentSheet) {
    for (let r = 3; r <= employmentSheet.rowCount; r++) {
      const row = employmentSheet.getRow(r);
      const rollNumber = cellStr(row, 1), orgName = cellStr(row, 2);
      if (!rollNumber || !orgName) continue;
      try {
        const [alum, employer] = await Promise.all([
          prisma.alumni.findUnique({ where: { chairmanId_rollNumber: { chairmanId, rollNumber } } }),
          prisma.employer.findUnique({ where: { chairmanId_organizationName: { chairmanId, organizationName: orgName } } }),
        ]);
        if (!alum) { summary.errors.push(`Employment row ${r}: no alumnus with roll number "${rollNumber}"`); continue; }
        if (!employer) { summary.errors.push(`Employment row ${r}: no employer named "${orgName}"`); continue; }

        await prisma.alumniEmployment.create({
          data: {
            alumniId: alum.id, employerId: employer.id, jobTitle: cellStr(row, 3) || null,
            startDate: cellDate(row, 4), endDate: cellDate(row, 5), salaryRange: cellStr(row, 6) || null,
            addedById: user.id, status: "PENDING",
          },
        });
        summary.employmentCreated++;
      } catch (err: any) { summary.errors.push(`Employment row ${r} (${rollNumber} @ ${orgName}): ${err.message || "failed"}`); }
    }
  }

  // ---- Degrees (depends on Alumni existing) ----
  const degreesSheet = workbook.getWorksheet("Degrees");
  if (degreesSheet) {
    for (let r = 3; r <= degreesSheet.rowCount; r++) {
      const row = degreesSheet.getRow(r);
      const rollNumber = cellStr(row, 1), degreeName = cellStr(row, 2);
      if (!rollNumber || !degreeName) continue;
      try {
        const alum = await prisma.alumni.findUnique({ where: { chairmanId_rollNumber: { chairmanId, rollNumber } } });
        if (!alum) { summary.errors.push(`Degree row ${r}: no alumnus with roll number "${rollNumber}"`); continue; }

        await prisma.alumniAdditionalDegree.create({
          data: { alumniId: alum.id, degreeName, institution: cellStr(row, 3) || "—", completionYear: cellNum(row, 4), addedById: user.id, status: "PENDING" },
        });
        summary.degreesCreated++;
      } catch (err: any) { summary.errors.push(`Degree row ${r} (${rollNumber}): ${err.message || "failed"}`); }
    }
  }

  return NextResponse.json(summary);
}
