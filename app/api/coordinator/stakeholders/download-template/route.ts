import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

const LEGEND_FILL: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEADC" } };
const EXAMPLE_FILL: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };

function addSheet(workbook: ExcelJS.Workbook, name: string, legend: string, columns: { header: string; key: string; width?: number }[], exampleRow: Record<string, any>) {
  const ws = workbook.addWorksheet(name);
  ws.mergeCells(1, 1, 1, columns.length);
  ws.getCell(1, 1).value = legend;
  ws.getCell(1, 1).font = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws.getCell(1, 1).alignment = { wrapText: true };
  ws.getRow(1).height = 30;

  ws.getRow(2).values = columns.map((c) => c.header);
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).fill = LEGEND_FILL;
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 22; });

  const row = ws.getRow(3);
  row.values = columns.map((c) => exampleRow[c.key] ?? "");
  row.fill = EXAMPLE_FILL;
  row.font = { italic: true, color: { argb: "FF555555" } };

  ws.views = [{ state: "frozen", ySplit: 2 }];
  return ws;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OBE Curriculum Governance";
  workbook.created = new Date();

  addSheet(workbook, "Alumni", "Fill in one row per alumnus. Roll Number must be unique. The green row below is an example — replace or delete it.",
    [
      { header: "Roll Number", key: "rollNumber" }, { header: "Name", key: "name" }, { header: "Email", key: "email" },
      { header: "Degree Program", key: "degreeProgram" }, { header: "Graduation Year", key: "graduationYear", width: 16 },
      { header: "Work Experience Years", key: "workExperienceYears", width: 20 },
    ],
    { rollNumber: "2019-CS-001", name: "Ayesha Khan", email: "ayesha.khan@example.com", degreeProgram: "BS Computer Science", graduationYear: 2023, workExperienceYears: 2 }
  );

  addSheet(workbook, "Employers", "Fill in one row per organization. Organization Name must be unique.",
    [
      { header: "Organization Name", key: "organizationName", width: 28 }, { header: "Contact Name", key: "contactName" },
      { header: "Contact Email", key: "contactEmail" }, { header: "Company Size", key: "companySize", width: 16 },
      { header: "Industry Type", key: "industryType" },
    ],
    { organizationName: "Systems Limited", contactName: "Ahmed Raza", contactEmail: "ahmed.raza@example.com", companySize: "500+", industryType: "Software" }
  );

  addSheet(workbook, "Employment", "Links an alumnus (by Roll Number) to an employer (by Organization Name) — both must already exist, either already in the system or added in the Alumni/Employers sheets above in this same file. End Date left blank means still employed there.",
    [
      { header: "Alumni Roll Number", key: "alumniRollNumber", width: 20 }, { header: "Organization Name", key: "organizationName", width: 28 },
      { header: "Job Title", key: "jobTitle", width: 24 }, { header: "Start Date (YYYY-MM-DD)", key: "startDate", width: 22 },
      { header: "End Date (YYYY-MM-DD, blank = current)", key: "endDate", width: 30 }, { header: "Salary Range", key: "salaryRange", width: 20 },
    ],
    { alumniRollNumber: "2019-CS-001", organizationName: "Systems Limited", jobTitle: "Software Engineer", startDate: "2023-09-01", endDate: "", salaryRange: "PKR 80,000 - 100,000" }
  );

  addSheet(workbook, "Degrees", "Additional degrees an alumnus (by Roll Number) completed after graduating from here — MS, PhD, certifications.",
    [
      { header: "Alumni Roll Number", key: "alumniRollNumber", width: 20 }, { header: "Degree Name", key: "degreeName", width: 24 },
      { header: "Institution", key: "institution", width: 26 }, { header: "Completion Year", key: "completionYear", width: 16 },
    ],
    { alumniRollNumber: "2019-CS-001", degreeName: "MS Computer Science", institution: "Stanford University", completionYear: 2025 }
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="alumni-employers-bulk-template.xlsx"`,
    },
  });
}
