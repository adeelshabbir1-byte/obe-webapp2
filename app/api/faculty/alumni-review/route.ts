import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAlumniCustodian) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const [alumni, employers, employment] = await Promise.all([
    prisma.alumni.findMany({ where: { chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.employer.findMany({ where: { chairmanId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.alumniEmployment.findMany({ where: { status: "PENDING", alumni: { chairmanId } }, include: { alumni: true, employer: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const submitterIds = Array.from(new Set([
    ...alumni.map((a) => a.addedById), ...employers.map((e) => e.addedById), ...employment.map((e) => e.addedById),
  ].filter((id): id is string => !!id)));
  const submitters = submitterIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: submitterIds } } }) : [];
  const nameById = new Map(submitters.map((s) => [s.id, s.name]));

  return NextResponse.json({
    alumni: alumni.map((a) => ({ ...a, submitterName: a.addedById ? nameById.get(a.addedById) || "—" : "—" })),
    employers: employers.map((e) => ({ ...e, submitterName: e.addedById ? nameById.get(e.addedById) || "—" : "—" })),
    employment: employment.map((e) => ({
      id: e.id, jobTitle: e.jobTitle, startDate: e.startDate, endDate: e.endDate, salaryRange: e.salaryRange,
      alumniName: e.alumni.name, employerName: e.employer.organizationName,
      submitterName: e.addedById ? nameById.get(e.addedById) || "—" : "—",
    })),
  });
}
