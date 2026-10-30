import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { toCsv } from "../../../lib/outcomesReport";
import { withErrors } from "../../../lib/apiHandler";

// The Institute Head's own backup: every academic table of the institute as CSV in one ZIP (no passwords or secrets).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head can export the institute's data." }, { status: 403 });
  const cid = user.id;
  const staff = await prisma.user.findMany({ where: { OR: [{ id: cid }, { managedById: cid }] }, select: { id: true, name: true, email: true, username: true, role: true, secondaryRole: true, isActive: true, createdAt: true } });
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: cid } } });
  const bIds = batches.map((b) => b.id);
  const students = await prisma.student.findMany({ where: { batchId: { in: bIds } }, select: { id: true, batchId: true, name: true, rollNumber: true, createdAt: true } });
  const sIds = students.map((s) => s.id);
  const courses = await prisma.course.findMany({ where: { batchId: { in: bIds } } });
  const cIds = courses.map((c) => c.id);
  const [plos, clos, insts, enr, marks, recs] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId: { in: bIds } } }),
    prisma.cLO.findMany({ where: { courseId: { in: cIds } } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: cIds } } }),
    prisma.studentEnrollment.findMany({ where: { courseId: { in: cIds } } }),
    prisma.studentMark.findMany({ where: { courseId: { in: cIds } } }),
    prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: sIds } } }),
  ]);
  const zip = new JSZip();
  const add = (name: string, rows: Record<string, unknown>[]) => { if (!rows.length) { zip.file(`${name}.csv`, ""); return; } const cols = Object.keys(rows[0]); zip.file(`${name}.csv`, toCsv([cols, ...rows.map((r) => cols.map((c) => { const v = r[c]; return v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number); }))])); };
  add("staff", staff); add("batches", batches); add("students", students); add("courses", courses); add("plos", plos); add("clos", clos);
  add("assessments", insts); add("enrollments", enr); add("marks", marks); add("results", recs);
  zip.file("README.txt", `OBEHUB institute export\nInstitute Head: ${user.name}\nCreated: ${new Date().toISOString()}\nOne CSV per table. IDs link the tables (e.g. marks.studentId → students.id). Passwords and security secrets are never exported.\n`);
  await writeAuditLog({ actorUserId: user.id, action: "INSTITUTE_DATA_EXPORTED", metadata: { students: students.length, courses: courses.length, marks: marks.length } });
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new NextResponse(buf as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="obehub-export-${new Date().toISOString().slice(0, 10)}.zip"` } });
}
export const GET = withErrors(GET_handler);
