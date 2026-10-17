import ExcelJS from "exceljs";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// Employee upload: few required columns (the rest each person fills in their Profile). Column names follow the usual
// ERP employee exports (ERPNext / Odoo), so an export from those can be pasted in.
export const EMP_COLUMNS = [
  { key: "name", header: "Name *", width: 26 },
  { key: "email", header: "Email *", width: 30 },
  { key: "department", header: "Department *", width: 26 },
  { key: "employmentType", header: "Employment Type *", width: 18 },
  { key: "employeeCode", header: "Employee ID", width: 14 },
  { key: "designation", header: "Designation / Rank", width: 22 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "dateOfJoining", header: "Date of Joining", width: 16 },
  { key: "specialization", header: "Specialisation", width: 24 },
  { key: "teaches", header: "Teaches (Yes/No)", width: 16 },
] as const;
export const EMPLOYMENT_TYPES = ["Permanent", "Visiting", "Contract"];
export const UPLOAD_ROLES = ["CHAIRMAN", "HEAD_OF_DEPARTMENT"];

export type EmpRow = { row: number; name: string; email: string; department: string; employmentType: string; employeeCode: string; designation: string; phone: string; dateOfJoining: string; specialization: string; teaches: boolean };
export type EmpCheck = EmpRow & { status: "NEW" | "UPDATE" | "ERROR"; reason?: string; departmentId?: string; userId?: string };

/** The departments the uploader may load people into: all of the institute's for the Institute Head, own for a Chairman (HoD). */
export async function uploadDepartments(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }) {
  const head = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  const all = await prisma.department.findMany({ where: { chairmanId: head }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { head, departments: user.role === "CHAIRMAN" ? all : all.filter((d) => d.id === user.departmentId) };
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
};

/** Reads the first sheet: finds the header row by its names, so column order does not matter. */
export async function parseEmployees(buf: ArrayBuffer): Promise<EmpRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
  const want: Record<string, string[]> = {
    name: ["name", "fullname", "employeename"], email: ["email", "emailaddress", "workemail", "companyemail"], department: ["department"],
    employmentType: ["employmenttype", "type", "employeetype"], employeeCode: ["employeeid", "employee", "employeecode", "badgeid", "id"],
    designation: ["designationrank", "designation", "rank", "jobposition", "jobtitle"], phone: ["phone", "mobile", "cellnumber", "workphone"],
    dateOfJoining: ["dateofjoining", "joiningdate", "joindate"], specialization: ["specialisation", "specialization"], teaches: ["teachesyesno", "teaches"],
  };
  let headerRow = 0; const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r++) {
    const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).map((v) => norm(cellText(v)));
    if (vals.includes("email") || vals.some((v) => v.startsWith("email"))) {
      headerRow = r;
      vals.forEach((v, i) => { for (const [k, names] of Object.entries(want)) if (!col[k] && names.includes(v)) col[k] = i; });
    }
  }
  if (!headerRow || !col.email) return [];
  const out: EmpRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (k: string) => (col[k] ? cellText(row.getCell(col[k]).value).trim() : "");
    const email = g("email").toLowerCase();
    const name = g("name");
    if (!email && !name) continue;
    if (email.endsWith("@example.com")) continue; // the template's example row
    out.push({ row: r, name, email, department: g("department"), employmentType: g("employmentType"), employeeCode: g("employeeCode"), designation: g("designation"), phone: g("phone"), dateOfJoining: g("dateOfJoining"), specialization: g("specialization"), teaches: !/^n/i.test(g("teaches")) });
  }
  return out;
}

/** Checks every row: required columns, department, type, duplicates; existing people (by email) are updates. */
export async function checkEmployees(rows: EmpRow[], departments: { id: string; name: string }[]): Promise<EmpCheck[]> {
  const byName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d.id]));
  const existing = await prisma.user.findMany({ where: { email: { in: rows.map((r) => r.email).filter(Boolean), mode: "insensitive" } }, select: { id: true, email: true } });
  const ex = new Map(existing.map((u) => [u.email.toLowerCase(), u.id]));
  const seen = new Set<string>();
  return rows.map((r) => {
    const fail = (reason: string): EmpCheck => ({ ...r, status: "ERROR", reason });
    if (!r.name) return fail("Name is missing.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return fail("Email is missing or not valid.");
    if (seen.has(r.email)) return fail("This email appears twice in the file."); seen.add(r.email);
    const departmentId = byName.get(r.department.trim().toLowerCase());
    if (!departmentId) return fail(r.department ? `Department "${r.department}" not found (or not yours). Use the names from the template's list.` : "Department is missing.");
    const type = EMPLOYMENT_TYPES.find((t) => t.toLowerCase() === r.employmentType.trim().toLowerCase());
    if (!type) return fail("Employment Type must be Permanent, Visiting or Contract.");
    if (r.dateOfJoining && isNaN(Date.parse(r.dateOfJoining))) return fail("Date of Joining is not a date (use YYYY-MM-DD).");
    const userId = ex.get(r.email);
    return { ...r, employmentType: type, departmentId, userId, status: userId ? "UPDATE" : "NEW" };
  });
}
