import { prisma } from "./db";

export type MoveGroup = {
  sourceId: string; sourceName: string; sourceRole: string; program: string;
  batches: number; courses: number; students: number;
  suggestedLeadId: string | null; // the Program Lead whose program this is
  alreadyRight: boolean;
};
export type MoveLead = { id: string; name: string; program: string | null; departmentName: string };
export type MoveData = { groups: MoveGroup[]; leads: MoveLead[] };

type Scope = { chairmanId: string; departmentId: string | null }; // departmentId null = the whole institute (Institute Head)

/** Every (holder, degree program) that has batches, with what would move, and the lead each should go to. */
export async function loadMoveData(scope: Scope): Promise<MoveData> {
  const deptPrograms = scope.departmentId
    ? (await prisma.departmentProgram.findMany({ where: { departmentId: scope.departmentId }, select: { degreeProgram: true } })).map((p) => p.degreeProgram)
    : [];
  const batches = await prisma.batch.findMany({
    where: {
      coordinator: { managedById: scope.chairmanId },
      ...(scope.departmentId ? { OR: [{ coordinator: { departmentId: scope.departmentId } }, { coordinator: { departmentId: null }, degreeProgram: { in: deptPrograms } }] } : {}),
    },
    select: { id: true, degreeProgram: true, coordinatorId: true, coordinator: { select: { name: true, role: true } } },
  });
  const ids = batches.map((b) => b.id);
  const [courseCounts, studentCounts, leadRows, depts] = await Promise.all([
    prisma.course.groupBy({ by: ["batchId"], where: { batchId: { in: ids } }, _count: { _all: true } }),
    prisma.student.groupBy({ by: ["batchId"], where: { batchId: { in: ids } }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: "PROGRAM_COORDINATOR", managedById: scope.chairmanId, isActive: true, departmentId: scope.departmentId ? scope.departmentId : { not: null } },
      select: { id: true, name: true, leadProgram: true, departmentId: true }, orderBy: { name: "asc" },
    }),
    prisma.department.findMany({ where: { chairmanId: scope.chairmanId }, select: { id: true, name: true } }),
  ]);
  const cBy = new Map<string, number>(courseCounts.map((c) => [c.batchId as string, c._count._all]));
  const sBy = new Map<string, number>(studentCounts.map((c) => [c.batchId as string, c._count._all]));
  const deptName = new Map<string, string>(depts.map((d) => [d.id, d.name]));
  const groups = new Map<string, MoveGroup>();
  for (const b of batches) {
    const key = `${b.coordinatorId}|${b.degreeProgram}`;
    const lead = leadRows.find((l) => (l.leadProgram || "").trim().toLowerCase() === b.degreeProgram.trim().toLowerCase());
    const g = groups.get(key) || { sourceId: b.coordinatorId, sourceName: b.coordinator.name, sourceRole: b.coordinator.role, program: b.degreeProgram, batches: 0, courses: 0, students: 0, suggestedLeadId: lead?.id || null, alreadyRight: lead?.id === b.coordinatorId };
    g.batches += 1; g.courses += cBy.get(b.id) || 0; g.students += sBy.get(b.id) || 0;
    groups.set(key, g);
  }
  return {
    groups: Array.from(groups.values()).sort((a, b) => Number(a.alreadyRight) - Number(b.alreadyRight) || a.program.localeCompare(b.program)),
    leads: leadRows.map((l) => ({ id: l.id, name: l.name, program: l.leadProgram || null, departmentName: l.departmentId ? deptName.get(l.departmentId) || "" : "" })),
  };
}

/** Moves one program's batches, and everything that hangs off them, from one holder to a Program Lead. */
export async function moveProgram(sourceId: string, program: string, targetId: string): Promise<{ batches: number; courses: number; students: number }> {
  if (sourceId === targetId) throw new Error("It is already with that Program Lead.");
  const batches = await prisma.batch.findMany({ where: { coordinatorId: sourceId, degreeProgram: program }, select: { id: true, batchName: true } });
  if (batches.length === 0) throw new Error("No batches of that program were found.");
  const clash = await prisma.batch.findMany({ where: { coordinatorId: targetId, degreeProgram: program, batchName: { in: batches.map((b) => b.batchName) } }, select: { batchName: true } });
  if (clash.length > 0) throw new Error(`The Program Lead already has a batch with the same name: ${clash.map((c) => c.batchName).join(", ")}. Rename one of them first.`);
  const ids = batches.map((b) => b.id);

  return prisma.$transaction(async (tx) => {
    const batchRes = await tx.batch.updateMany({ where: { id: { in: ids } }, data: { coordinatorId: targetId } });
    const courseRes = await tx.course.updateMany({ where: { batchId: { in: ids } }, data: { coordinatorId: targetId } });
    await tx.pLO.updateMany({ where: { batchId: { in: ids } }, data: { coordinatorId: targetId } });
    await tx.electiveSlotGroup.updateMany({ where: { batchId: { in: ids } }, data: { coordinatorId: targetId } });
    await tx.studentTranscriptRecord.updateMany({ where: { coordinatorId: sourceId, student: { batchId: { in: ids } } }, data: { coordinatorId: targetId } });
    const studentCount = await tx.student.count({ where: { batchId: { in: ids } } });

    // Program-level records follow only when the Program Lead does not already have the same one.
    for (const dp of await tx.degreeProgram.findMany({ where: { coordinatorId: sourceId, name: program } })) {
      const has = await tx.degreeProgram.findFirst({ where: { coordinatorId: targetId, shortCode: dp.shortCode } });
      if (!has) await tx.degreeProgram.update({ where: { id: dp.id }, data: { coordinatorId: targetId } });
    }
    for (const sd of await tx.semesterDates.findMany({ where: { coordinatorId: sourceId, degreeProgram: program } })) {
      const has = await tx.semesterDates.findFirst({ where: { coordinatorId: targetId, degreeProgram: program, termName: sd.termName, termYear: sd.termYear } });
      if (!has) await tx.semesterDates.update({ where: { id: sd.id }, data: { coordinatorId: targetId } });
    }
    const profile = await tx.programProfile.findFirst({ where: { coordinatorId: sourceId, degreeProgram: program } });
    if (profile && !(await tx.programProfile.findFirst({ where: { coordinatorId: targetId, degreeProgram: program } }))) {
      await tx.programProfile.update({ where: { id: profile.id }, data: { coordinatorId: targetId } });
    }

    // Settings every lead needs (current term, grading scale, holidays) are COPIED, only if the lead has none yet.
    const copy = async (name: "currentTerm" | "gradingScale" | "holiday" | "classDayMode") => {
      const d = (tx as any)[name];
      if ((await d.count({ where: { coordinatorId: targetId } })) > 0) return;
      const rows = await d.findMany({ where: { coordinatorId: sourceId } });
      if (rows.length === 0) return;
      await d.createMany({ data: rows.map(({ id: _id, coordinatorId: _c, updatedAt: _u, ...rest }: any) => ({ ...rest, coordinatorId: targetId })) });
    };
    for (const n of ["currentTerm", "gradingScale", "holiday", "classDayMode"] as const) await copy(n);

    const target = await tx.user.findUnique({ where: { id: targetId }, select: { leadProgram: true } });
    if (target && !target.leadProgram) await tx.user.update({ where: { id: targetId }, data: { leadProgram: program } });

    return { batches: batchRes.count, courses: courseRes.count, students: studentCount };
  }, { timeout: 60000, maxWait: 10000 });
}
