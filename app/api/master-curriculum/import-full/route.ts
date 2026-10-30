import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { importFullCurriculum, readProgramInfo } from "../../../../lib/masterFullImport";
import { withErrors } from "../../../../lib/apiHandler";

export const maxDuration = 300;

// Full curriculum import (courses, PLOs, CLOs with PLO mapping, lecture topics) from one Excel file.
// OMC: into the institute's own curriculum for that degree program (created if missing), or into a chosen own copy.
// Super User: into a chosen official curriculum, or a new official one.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "OMC" && user.role !== "SUPER_USER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file" }, { status: 400 });
  const owner = user.role === "OMC" ? user.managedById : null;
  if (user.role === "OMC" && !owner) return NextResponse.json({ error: "no institute on record for this account" }, { status: 400 });

  let curriculumId = String(form?.get("curriculumId") || "");
  if (curriculumId) {
    const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { chairmanId: true } });
    if (!c || c.chairmanId !== owner) return NextResponse.json({ error: user.role === "OMC" ? "Only your own copy can be changed." : "Choose an official curriculum." }, { status: 403 });
  } else {
    let info;
    try { info = await readProgramInfo(file); } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }
    const degreeProgram = (String(form?.get("degreeProgram") || "") || info?.degreeProgram || "").trim();
    if (!degreeProgram) return NextResponse.json({ error: "The file needs a Program sheet with the Degree program name (or select a curriculum first)." }, { status: 400 });
    const existing = await prisma.masterCurriculum.findFirst({ where: { chairmanId: owner, degreeProgram } });
    curriculumId = existing?.id || (await prisma.masterCurriculum.create({
      data: { authority: info?.authority || "Institution", title: degreeProgram, version: info?.version || String(new Date().getFullYear()), degreeProgram, status: "PUBLISHED", chairmanId: owner },
    })).id;
  }
  try {
    const r = await importFullCurriculum(curriculumId, file);
    await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_FULL_IMPORT", entityType: "MasterCurriculum", entityId: curriculumId, metadata: { plos: r.plos, courses: r.coursesCreated + r.coursesUpdated, clos: r.clos, topics: r.topics } });
    return NextResponse.json({ curriculumId, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "could not read that file" }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
