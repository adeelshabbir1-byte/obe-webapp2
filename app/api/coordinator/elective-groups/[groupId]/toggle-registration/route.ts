import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function PUT(req: NextRequest, { params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const group = await prisma.electiveSlotGroup.findUnique({ where: { id: params.groupId } });
  if (!group || group.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (group.finalized) return NextResponse.json({ error: "already finalized" }, { status: 400 });

  const opening = !!body.open;
  const updated = await prisma.electiveSlotGroup.update({ where: { id: group.id }, data: { registrationOpen: opening } });

  // Opening registration also gives every student in the batch a
  // default pick — the first option (by id, i.e. whichever the
  // Coordinator added to this group first) — rather than leaving them
  // with no choice at all until they act. Students can freely change
  // this to a different option while registration stays open (the
  // existing elective-choice endpoint already allows that with no
  // approval needed). Only fills students who don't already have a
  // choice recorded, so re-opening registration never overwrites
  // anyone's own selection.
  let defaultedCount = 0;
  if (opening) {
    const [students, options, existingChoices] = await Promise.all([
      prisma.student.findMany({ where: { batchId: group.batchId }, select: { id: true } }),
      prisma.electiveSlotOption.findMany({ where: { groupId: group.id }, orderBy: { id: "asc" } }),
      prisma.electiveChoice.findMany({ where: { groupId: group.id }, select: { studentId: true } }),
    ]);
    const firstOption = options[0];
    if (firstOption) {
      const alreadyChosen = new Set(existingChoices.map((c) => c.studentId));
      const toDefault = students.filter((s) => !alreadyChosen.has(s.id));
      if (toDefault.length > 0) {
        await prisma.electiveChoice.createMany({
          data: toDefault.map((s) => ({ groupId: group.id, studentId: s.id, optionId: firstOption.id })),
          skipDuplicates: true,
        });
        defaultedCount = toDefault.length;
      }
    }
  }

  return NextResponse.json({ registrationOpen: updated.registrationOpen, defaultedCount });
}
