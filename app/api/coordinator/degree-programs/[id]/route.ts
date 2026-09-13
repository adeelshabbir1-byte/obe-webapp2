import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const program = await prisma.degreeProgram.findUnique({ where: { id: params.id } });
  if (!program || program.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.degreeProgram.update({
    where: { id: params.id },
    data: {
      defaultIntakeSize: body.defaultIntakeSize !== undefined ? parseInt(body.defaultIntakeSize, 10) : program.defaultIntakeSize,
      usuallyOfferedInFall: body.usuallyOfferedInFall !== undefined ? !!body.usuallyOfferedInFall : program.usuallyOfferedInFall,
      usuallyOfferedInSpring: body.usuallyOfferedInSpring !== undefined ? !!body.usuallyOfferedInSpring : program.usuallyOfferedInSpring,
    },
  });
  return NextResponse.json({ program: updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const program = await prisma.degreeProgram.findUnique({ where: { id: params.id } });
  if (!program || program.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.degreeProgram.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
