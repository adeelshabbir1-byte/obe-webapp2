import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

// Lists every Master Curriculum with a course/PLO count, for the picker
// on the editing page — the shared official copies (chairmanId null),
// plus this chairman's own clones, but never another chairman's clones,
// since those are private to them.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curricula = await prisma.masterCurriculum.findMany({
    where: user.managedById ? await (await import("../../../../lib/curriculumLibrary")).curriculaWhere(user.managedById) : { id: "none" },
    select: { id: true, title: true, authority: true, version: true, status: true, chairmanId: true, _count: { select: { courses: true, plos: true } } },
    orderBy: { title: "asc" },
  });

  // An OMC member of a department sees only the curricula his department works with: the institute's own copies for
  // the department's programs (by name, or used by those programs' batches) and the official curricula they came from
  // or that carry one of those program names. Without a department (or programs) he sees everything, as before.
  const { departmentsOf } = await import("../../../../lib/fyp");
  const depts = await departmentsOf(user.id);
  const programs = depts.length ? (await prisma.departmentProgram.findMany({ where: { departmentId: { in: depts }, chairmanId: user.managedById || "none" }, select: { degreeProgram: true } })).map((p) => p.degreeProgram) : [];
  let list = curricula;
  if (programs.length) {
    const norm = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const names = programs.map(norm).filter(Boolean);
    const extra = await prisma.masterCurriculum.findMany({ where: { id: { in: curricula.map((c) => c.id) } }, select: { id: true, degreeProgram: true, parentCurriculumId: true } });
    const info = new Map(extra.map((x) => [x.id, x]));
    const used = new Set((await prisma.masterCourse.findMany({ where: { masterCurriculumId: { in: curricula.map((c) => c.id) }, adoptedInto: { some: { batch: { degreeProgram: { in: programs } } } } }, select: { masterCurriculumId: true }, distinct: ["masterCurriculumId"] }).catch(() => [])).map((m: { masterCurriculumId: string }) => m.masterCurriculumId));
    const matches = (c: { id: string; title: string }) => { const t = `${norm(info.get(c.id)?.degreeProgram)} ${norm(c.title)}`; return names.some((n) => t.includes(n)) || used.has(c.id); };
    const own = curricula.filter((c) => c.chairmanId === user.managedById && matches(c));
    const parents = new Set(own.map((c) => info.get(c.id)?.parentCurriculumId).filter(Boolean) as string[]);
    list = curricula.filter((c) => own.includes(c) || (c.chairmanId !== user.managedById && (parents.has(c.id) || matches(c))));
  }
  return NextResponse.json({
    curricula: list.map((c) => ({ ...c, isOwned: c.chairmanId === user.managedById })),
    scopedTo: programs,
  });
}
export const GET = withErrors(GET_handler);
