import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// Bulk-loads (or updates) an entire program's worth of official courses
// into this chairman's own Master Curriculum in one paste, instead of
// clicking "+ Add Course" one row at a time — meant for exactly this
// situation: a department hands over an official semester-by-semester
// course plan (e.g. an HEC/NCEAC curriculum document) and it needs to
// land in the app as real, editable MasterCourse rows.
//
// If this chairman doesn't have an owned curriculum for the given
// degreeProgram yet, one is created here (self-service — unlike
// /api/admin/curricula, which is SUPER_USER-only and meant for the
// platform-wide shared library, not a single institution's own copy).
// Existing rows are matched and updated by course code, so re-pasting a
// corrected sheet is always safe and never creates duplicates.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const degreeProgram: string | undefined = body.degreeProgram?.trim();
  const authority: string = body.authority?.trim() || "Institution";
  const version: string = body.version?.trim() || String(new Date().getFullYear());
  const rows: any[] = Array.isArray(body.rows) ? body.rows : [];

  if (!degreeProgram) return NextResponse.json({ error: "degreeProgram is required (e.g. \"BS Computer Science\")" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: "no rows to import" }, { status: 400 });

  // Reuse this chairman's own curriculum for the program if one already
  // exists, so re-running an import (e.g. a corrected file) updates it
  // in place rather than creating a second, competing copy.
  let curriculum = await prisma.masterCurriculum.findFirst({ where: { chairmanId: user.managedById, degreeProgram } });
  if (!curriculum) {
    curriculum = await prisma.masterCurriculum.create({
      data: { authority, title: degreeProgram, version, degreeProgram, status: "PUBLISHED", chairmanId: user.managedById },
    });
  }

  const existingCourses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculum.id }, select: { id: true, code: true } });
  const existingByCode = new Map(existingCourses.map((c) => [c.code, c.id]));

  let created = 0, updated = 0;
  const errors: string[] = [];

  for (const r of rows) {
    const code = String(r.code || "").trim();
    const title = String(r.title || "").trim();
    const creditHours = Number(r.creditHours);
    const category = String(r.category || "").trim();
    const domain = r.domain ? String(r.domain).trim() : null;
    const semesterNumber = r.semesterNumber !== undefined && r.semesterNumber !== null && r.semesterNumber !== "" ? Number(r.semesterNumber) : null;

    if (!code || !title || !category || !Number.isFinite(creditHours)) {
      errors.push(`Skipped a row — code/title/category/creditHours required (got: ${JSON.stringify(r)})`);
      continue;
    }

    const existingId = existingByCode.get(code);
    try {
      if (existingId) {
        await prisma.masterCourse.update({
          where: { id: existingId },
          data: { title, creditHours, category, domain, semesterNumber },
        });
        updated++;
      } else {
        const newCourse = await prisma.masterCourse.create({
          data: { masterCurriculumId: curriculum.id, code, title, creditHours, category, domain, semesterNumber },
        });
        existingByCode.set(code, newCourse.id);
        created++;
      }
    } catch (e: any) {
      errors.push(`"${code}": ${e.message || "failed to save"}`);
    }
  }

  await writeAuditLog({
    actorUserId: user.id, action: "MASTER_CURRICULUM_BULK_IMPORTED", entityType: "MasterCurriculum", entityId: curriculum.id,
    metadata: { degreeProgram, created, updated, errorCount: errors.length },
  });

  return NextResponse.json({ curriculum, created, updated, errors });
}
