import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { flowOf, startFlow, markStep, stepHref } from "../../../../../lib/batchFlow";

export const dynamic = "force-dynamic";

// "Continue set-up →": opens the batch's next open step of the guided set-up (and starts the set-up the first time).
export default async function ContinueSetup({ params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const b = await prisma.batch.findFirst({ where: { id: params.batchId, coordinatorId: user.id }, select: { id: true, _count: { select: { courses: true } } } });
  if (!b) redirect("/coordinator/batches");
  await startFlow(b.id, user);
  // Courses in the batch: source, tracks and import (steps 2–4) are behind us.
  if (b._count.courses > 0) { const f0 = await flowOf(b.id); for (const n of [2, 3, 4]) if (!f0?.steps[n - 1].mark) await markStep(b.id, n, user).catch(() => null); }
  const f = await flowOf(b.id);
  redirect(f ? stepHref(f.current, b.id, b._count.courses > 0) : `/coordinator/courses?batchId=${b.id}`);
}
