import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { institutePeople } from "../../../../../lib/institutePeople";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const people = await institutePeople(user.id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Users");
  ws.columns = [
    { header: "Username", key: "username", width: 20 }, { header: "Name", key: "name", width: 26 }, { header: "Email", key: "email", width: 30 },
    { header: "Role", key: "role", width: 22 }, { header: "Also works as", key: "also", width: 30 }, { header: "Department", key: "department", width: 24 },
    { header: "Program", key: "program", width: 22 }, { header: "Login status", key: "status", width: 20 },
  ];
  people.forEach((p) => ws.addRow(p));
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="institute-users.xlsx"' } });
}
