import { notFound, redirect } from "next/navigation";
import { getSignedInUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import PrintButton from "../../../../components/PrintButton";
import { tdb, badgeOf } from "../../../../lib/training";
import { chairmanIdFor } from "../../../../lib/reportScope";

export const dynamic = "force-dynamic";

export default async function Certificate({ params }: { params: { id: string } }) {
  const user = await getSignedInUser();
  if (!user) redirect("/login");
  const a = (await tdb.trainingAttempt.findUnique({ where: { id: params.id } }).catch(() => null)) as { userId: string; badge: string; score: number; total: number; passed: boolean; submittedAt: Date } | null;
  if (!a || !a.passed) notFound();
  const holder = await prisma.user.findUnique({ where: { id: a.userId }, select: { id: true, name: true, role: true, managedById: true } });
  if (!holder) notFound();
  const [mine, theirs] = await Promise.all([chairmanIdFor(user), chairmanIdFor(holder)]);
  if (holder.id !== user.id && mine !== theirs) notFound();
  const inst = theirs ? await prisma.user.findUnique({ where: { id: theirs }, select: { instituteName: true } }) : null;
  return (
    <main style={{ maxWidth: 820, margin: "30px auto", padding: 20 }}>
      <div className="no-print" style={{ marginBottom: 10 }}><PrintButton /></div>
      <div style={{ border: "6px double #1B3A5C", padding: "48px 40px", textAlign: "center" }}>
        <div style={{ letterSpacing: ".2em", fontSize: 13 }}>{(inst?.instituteName || "OBEHUB").toUpperCase()}</div>
        <h1 style={{ fontSize: 34, margin: "18px 0 6px" }}>Certificate of Completion</h1>
        <p>This certifies that</p><h2 style={{ fontSize: 28, margin: "6px 0" }}>{holder.name}</h2>
        <p>has passed the <b>{badgeOf(a.badge)?.name}</b> certification in Outcome-Based Education</p>
        <p>with a score of {a.score}/{a.total} on {a.submittedAt.toISOString().slice(0, 10)}.</p>
        <p className="small-note" style={{ marginTop: 30 }}>Certificate ID {params.id}</p>
      </div>
    </main>
  );
}
