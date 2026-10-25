import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { setupProgress } from "../../../../lib/setupProgress";

// "Continue set-up →": opens the first step of the batch's set-up that is not done yet.
export default async function NextSetupStep({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const b = await prisma.batch.findFirst({ where: { id: searchParams.batchId || "", coordinatorId: user.id }, select: { id: true } });
  if (!b) redirect("/coordinator/batches");
  const p = await setupProgress(b.id);
  redirect(p?.current.url || `/coordinator/courses?batchId=${b.id}`);
}
