import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { hashPassword } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";

const DEFAULT_TEMP_PASSWORD = "12345678"; // same fixed default already used by "Reset All Faculty Passwords"

function roleFromLabel(raw: string): "SUBJECT_EXPERT" | "INSTRUCTOR" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "INSTRUCTOR"; // blank Role column = Course Instructor, the more common case
  if (v === "subject expert" || v === "subject_expert") return "SUBJECT_EXPERT";
  if (v === "course instructor" || v === "instructor") return "INSTRUCTOR";
  return null; // unrecognized — reported back, row skipped, nothing guessed
}

// A Login ID only has to be unique, never shown to anyone outside this
// institution, and the schema still requires a unique email on every User
// row — so each new faculty member gets a harmless placeholder address
// derived from their login id rather than asking the coordinator for one.
function placeholderEmail(username: string): string {
  return `${username}@faculty.local`;
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const ws = workbook.worksheets[0];
  if (!ws) return NextResponse.json({ error: "The uploaded file has no worksheet." }, { status: 400 });

  // Existing logins — a row that carries an id is left untouched by this
  // tool (editing an existing faculty member stays on the regular Faculty
  // Onboarding page); only blank-id rows create anything.
  const existingIds = new Set((await prisma.user.findMany({ where: { managedById: user.id }, select: { id: true } })).map((u) => u.id));

  // Username/email collisions are checked globally, since both columns are
  // unique across the whole system, not just this coordinator's own faculty.
  const allUsernames = new Set((await prisma.user.findMany({ select: { username: true } })).map((u) => u.username.toLowerCase()));
  const allEmails = new Set((await prisma.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()));

  let created = 0, rowsSkippedExisting = 0;
  const createdLogins: { name: string; username: string; role: string }[] = [];
  const skippedRows: { row: number; reason: string }[] = [];
  const seenUsernamesThisFile = new Set<string>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawId = row.getCell(1).value;
    const rawUsername = row.getCell(2).value;
    const rawName = row.getCell(3).value;
    const rawSpecialization = row.getCell(4).value;
    const rawRole = row.getCell(5).value;

    if (rawId && String(rawId).trim()) {
      if (existingIds.has(String(rawId).trim())) rowsSkippedExisting++;
      continue; // existing login — not editable from this sheet
    }

    const username = rawUsername ? String(rawUsername).trim() : "";
    const name = rawName ? String(rawName).trim() : "";
    if (!username && !name) continue; // a genuinely blank/legend row, not a real entry

    if (!username || !name) {
      skippedRows.push({ row: r, reason: "Login ID and Faculty Name are both required" });
      continue;
    }

    const usernameKey = username.toLowerCase();
    if (allUsernames.has(usernameKey) || seenUsernamesThisFile.has(usernameKey)) {
      skippedRows.push({ row: r, reason: `Login ID "${username}" is already in use` });
      continue;
    }

    const role = roleFromLabel(rawRole ? String(rawRole) : "");
    if (!role) {
      skippedRows.push({ row: r, reason: `Role must be "Subject Expert" or "Course Instructor" (got "${rawRole}")` });
      continue;
    }

    const email = placeholderEmail(username);
    if (allEmails.has(email.toLowerCase())) {
      skippedRows.push({ row: r, reason: `Login ID "${username}" collides with an existing account's generated email` });
      continue;
    }

    const passwordHash = await hashPassword(DEFAULT_TEMP_PASSWORD);
    const createdUser = await prisma.user.create({
      data: {
        email, username, passwordHash, name, role,
        managedById: user.id,
        departmentId: user.departmentId,
        mustChangePassword: true,
        specialization: rawSpecialization ? String(rawSpecialization).trim() || null : null,
      },
    });
    await writeAuditLog({ actorUserId: user.id, action: "FACULTY_ONBOARDED", entityType: "User", entityId: createdUser.id, metadata: { role, via: "bulk_excel_import" } });

    seenUsernamesThisFile.add(usernameKey);
    allUsernames.add(usernameKey);
    allEmails.add(email.toLowerCase());
    created++;
    createdLogins.push({ name, username, role });
  }

  return NextResponse.json({
    ok: true, created, rowsSkippedExisting,
    createdLogins, skippedRows: skippedRows.slice(0, 30),
    tempPassword: created > 0 ? DEFAULT_TEMP_PASSWORD : undefined,
  });
}
