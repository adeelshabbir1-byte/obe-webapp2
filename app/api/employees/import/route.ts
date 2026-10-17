import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { UPLOAD_ROLES, uploadDepartments, parseEmployees, checkEmployees, type EmpCheck } from "../../../../lib/employeeImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST multipart (file) → preview: every row checked as NEW / UPDATE / ERROR, nothing saved.
// POST JSON { rows, password } → saves those rows (the page sends them in small groups).
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !UPLOAD_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { head, departments } = await uploadDepartments(user);
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const fd = await req.formData();
    const f = fd.get("file");
    if (!(f instanceof File)) return NextResponse.json({ error: "Choose the Excel file first." }, { status: 400 });
    let rows;
    try { rows = await parseEmployees(await f.arrayBuffer()); } catch { return NextResponse.json({ error: "Could not read the file. Save it as .xlsx (Excel) and try again." }, { status: 400 }); }
    if (!rows.length) return NextResponse.json({ error: "No employees found. Keep the header row of the template (it must have an Email column)." }, { status: 400 });
    return NextResponse.json({ rows: await checkEmployees(rows, departments) });
  }
  const b = await req.json().catch(() => ({}));
  const password = String(b.password || "");
  if (password.length < 8) return NextResponse.json({ error: "temporary password missing" }, { status: 400 });
  // Check again on the server — never trust the preview the browser sends back.
  const rows = (await checkEmployees((Array.isArray(b.rows) ? b.rows : []).slice(0, 50), departments)).filter((r) => r.status !== "ERROR");
  const hash = await hashPassword(password);
  const done: { email: string; status: string; note?: string }[] = [];
  for (const r of rows as EmpCheck[]) {
    const profile = {
      employmentType: r.employmentType, ...(r.employeeCode ? { employeeCode: r.employeeCode } : {}), ...(r.designation ? { designation: r.designation } : {}),
      ...(r.phone ? { phone: r.phone } : {}), ...(r.dateOfJoining ? { dateOfJoining: new Date(r.dateOfJoining) } : {}), ...(r.specialization ? { specialization: r.specialization } : {}),
    };
    try {
      if (r.status === "NEW") {
        const taken = await prisma.user.findUnique({ where: { username: r.email } });
        if (taken) { done.push({ email: r.email, status: "SKIPPED", note: "username already used" }); continue; }
        const u = await prisma.user.create({ data: { email: r.email, username: r.email, name: r.name, passwordHash: hash, role: "INSTRUCTOR", managedById: head, departmentId: r.departmentId, canTeach: r.teaches, mustChangePassword: true } as never });
        await prisma.facultyProfile.create({ data: { userId: u.id, ...profile } as never });
        done.push({ email: r.email, status: "CREATED" });
      } else {
        const u = await prisma.user.findUnique({ where: { id: r.userId! }, select: { id: true, role: true, managedById: true, departmentId: true } });
        if (!u || (await chairmanIdFor(u).catch(() => "")) !== head) { done.push({ email: r.email, status: "SKIPPED", note: "belongs to another institute" }); continue; }
        await prisma.user.update({ where: { id: u.id }, data: { name: r.name, ...(u.departmentId ? {} : { departmentId: r.departmentId }) } });
        await prisma.facultyProfile.upsert({ where: { userId: u.id }, create: { userId: u.id, ...profile } as never, update: profile as never });
        done.push({ email: r.email, status: "UPDATED" });
      }
    } catch (e) { done.push({ email: r.email, status: "FAILED", note: e instanceof Error ? e.message.slice(0, 120) : "error" }); }
  }
  await writeAuditLog({ actorUserId: user.id, action: "EMPLOYEES_UPLOADED", entityType: "User", entityId: user.id, metadata: { created: done.filter((d) => d.status === "CREATED").length, updated: done.filter((d) => d.status === "UPDATED").length } }).catch(() => null);
  return NextResponse.json({ done });
}
