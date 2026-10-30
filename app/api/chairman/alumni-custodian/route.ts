import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { managedById: user.id, role: "PROGRAM_COORDINATOR" } });
  const faculty = await prisma.user.findMany({
    where: { managedById: { in: coordinators.map((c) => c.id) }, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } },
    orderBy: { name: "asc" },
  });
  const current = [...coordinators, ...faculty].find((u) => u.isAlumniCustodian);

  return NextResponse.json({
    candidates: [...coordinators, ...faculty].map((u) => ({ id: u.id, name: u.name, role: u.role })),
    currentCustodianId: current?.id || null,
  });
}

async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const coordinators = await prisma.user.findMany({ where: { managedById: user.id, role: "PROGRAM_COORDINATOR" } });
  const validIds = new Set([
    ...coordinators.map((c) => c.id),
    ...(await prisma.user.findMany({ where: { managedById: { in: coordinators.map((c) => c.id) } } })).map((u) => u.id),
  ]);

  if (body.userId && !validIds.has(body.userId)) return NextResponse.json({ error: "that person isn't part of your institution" }, { status: 400 });

  // Only one custodian at a time — clear any existing flag first.
  await prisma.user.updateMany({ where: { id: { in: Array.from(validIds) }, isAlumniCustodian: true }, data: { isAlumniCustodian: false } });
  if (body.userId) {
    await prisma.user.update({ where: { id: body.userId }, data: { isAlumniCustodian: true } });
  }

  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const PUT = withErrors(PUT_handler);
