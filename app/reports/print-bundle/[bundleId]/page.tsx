import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { ALL_REPORTS, reportParam } from "../../../../lib/reportRegistry";
import { canViewReport } from "../../../../lib/reportAcl";
import { coordinatorIdsFor, courseScopeFor } from "../../../../lib/reportScope";
import PrintBundleClient from "../../../../components/PrintBundleClient";

export default async function PrintBundlePage({ params }: { params: { bundleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  const bundle = await prisma.reportBundle.findUnique({ where: { id: params.bundleId } });
  if (!bundle) notFound();
  if (bundle.scope === "COORDINATOR" && bundle.ownerId !== user.id) notFound();

  const reportIds: string[] = JSON.parse(bundle.reportIds);
  const allowed: { id: string; href: string; title: string; param: string }[] = [];
  for (const id of reportIds) {
    const def = ALL_REPORTS.find((r) => r.id === id);
    if (def && (await canViewReport(user, id))) allowed.push({ id: def.id, href: def.href, title: def.title, param: reportParam(def.href) });
  }

  // The batches, courses and students this person may report on, so the bundle can fill every report in for them.
  const coordinatorIds = await coordinatorIdsFor(user);
  const needsStudents = allowed.some((r) => r.param === "student");
  const [batches, courses, students] = await Promise.all([
    prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] }),
    prisma.course.findMany({ where: { ...courseScopeFor(user), batchId: { not: null } }, select: { id: true, code: true, title: true, batchId: true, semesterNumber: true, isOffered: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }),
    needsStudents
      ? prisma.student.findMany({ where: { batch: { coordinatorId: { in: coordinatorIds } } }, select: { id: true, name: true, rollNumber: true, batchId: true }, orderBy: { rollNumber: "asc" } })
      : Promise.resolve([] as { id: string; name: string; rollNumber: string; batchId: string }[]),
  ]);

  const backHref = user.role === "SUPER_USER" ? "/admin/report-bundles" : user.role === "PROGRAM_COORDINATOR" ? "/coordinator/report-bundles" : "/omc/reports";
  return (
    <PrintBundleClient bundleId={bundle.id} bundleName={bundle.name} reports={allowed} backHref={backHref}
      batches={batches} courses={courses.map((c) => ({ ...c, batchId: c.batchId as string }))}
      students={students.map((s) => ({ id: s.id, label: `${s.rollNumber} — ${s.name}`, batchId: s.batchId as string }))} />
  );
}
