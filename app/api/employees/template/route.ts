import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { EMP_COLUMNS, EMPLOYMENT_TYPES, UPLOAD_ROLES, uploadDepartments } from "../../../../lib/employeeImport";
import { withErrors } from "../../../../lib/apiHandler";

// GET: the employee Excel template, with drop-down lists for Department and Employment Type.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !UPLOAD_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { departments } = await uploadDepartments(user);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Employees");
  ws.columns = EMP_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEADC" } };
  ws.addRow({ name: "Example Person (delete this row)", email: "someone@example.com", department: departments[0]?.name || "Computer Science", employmentType: "Permanent", employeeCode: "E-001", designation: "Assistant Professor", phone: "0300-1234567", dateOfJoining: "2024-09-01", specialization: "Artificial Intelligence", teaches: "Yes" });
  ws.getRow(2).font = { italic: true, color: { argb: "FF777777" } };
  const lists = wb.addWorksheet("Lists");
  departments.forEach((d, i) => { lists.getCell(i + 1, 1).value = d.name; });
  EMPLOYMENT_TYPES.forEach((t, i) => { lists.getCell(i + 1, 2).value = t; });
  ["Yes", "No"].forEach((t, i) => { lists.getCell(i + 1, 3).value = t; });
  for (let r = 2; r <= 1000; r++) {
    if (departments.length) ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: false, formulae: [`Lists!$A$1:$A$${departments.length}`] };
    ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: false, formulae: [`Lists!$B$1:$B$${EMPLOYMENT_TYPES.length}`] };
    ws.getCell(r, 10).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$C$1:$C$2"] };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = wb.addWorksheet("How to fill");
  ["Columns marked * are required: Name, Email, Department, Employment Type (Permanent / Visiting / Contract).",
    "Everything else is optional — each person can complete it later in their Profile.",
    "Email is the login name. A person already in the system (same email) is updated, not duplicated.",
    "Department must be one of the names in the drop-down (sheet 'Lists').",
    "Teaches: No for staff who do not teach (they are not offered courses). Blank = Yes.",
    "Roles (Program Lead, OMC, HoD …) are given later in the Hierarchy view, not here.",
    "Delete the grey example row before uploading."].forEach((t, i) => { help.getCell(i + 1, 1).value = t; });
  help.getColumn(1).width = 110;
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="employees_template.xlsx"' } });
}
export const GET = withErrors(GET_handler);
