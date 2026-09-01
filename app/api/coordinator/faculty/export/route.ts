import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const faculty = await prisma.user.findMany({
    where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] }, managedById: user.id },
    orderBy: { createdAt: "desc" },
  });

  return buildExcelResponse("faculty.xlsx", [{
    name: "Faculty",
    columns: [
      { header: "Username", key: "username", width: 18 },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 26 },
      { header: "Role", key: "role", width: 16 },
      { header: "Normal Load", key: "normalLoad", width: 12 },
      { header: "External Load", key: "externalLoadCount", width: 14 },
      { header: "External Note", key: "externalLoadNote", width: 26 },
    ],
    rows: faculty.map((f) => ({
      username: f.username, name: f.name, email: f.email,
      role: f.role === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor",
      normalLoad: f.normalLoad, externalLoadCount: f.externalLoadCount, externalLoadNote: f.externalLoadNote || "",
    })),
  }]);
}
