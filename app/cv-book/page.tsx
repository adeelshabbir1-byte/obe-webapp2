import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { cvView, sameInstitute } from "../../lib/studentCv";
import CvDocument from "../../components/CvDocument";
import PrintButton from "../../components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batch CV book" };

// Batch CV book: every approved and shared CV of a batch, with a cover and index — print or save as PDF for industry.
export default async function CvBookPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const batch = await prisma.batch.findUnique({ where: { id: searchParams.batchId || "" }, select: { id: true, degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } });
  if (!batch || !(await sameInstitute(user, batch.coordinator.managedById))) redirect("/dashboard");
  const ids = ((await (prisma as unknown as Record<string, any>).studentCv.findMany({ where: { status: "APPROVED", published: true, studentId: { in: (await prisma.student.findMany({ where: { batchId: batch.id }, select: { id: true } })).map((s) => s.id) } }, select: { studentId: true } }).catch(() => [])) as { studentId: string }[]).map((c) => c.studentId);
  const views = (await Promise.all(ids.map((id) => cvView(id)))).filter((v): v is NonNullable<typeof v> => !!v).sort((a, b) => a.student.rollNumber.localeCompare(b.student.rollNumber));
  const page: React.CSSProperties = { background: "#fff", maxWidth: 800, margin: "0 auto 20px", padding: "40px 48px", pageBreakAfter: "always", fontFamily: "Georgia, serif" };
  return (
    <main style={{ background: "#EEE", minHeight: "100vh", padding: "10px 0" }}>
      <style>{"@media print { main { background: #fff !important; padding: 0 !important } .cv-page { margin: 0 !important; max-width: none !important } @page { size: A4; margin: 12mm } }"}</style>
      <div className="no-print" style={{ textAlign: "center", margin: 10 }}><PrintButton /></div>
      <section style={{ ...page, textAlign: "center", paddingTop: 200 }}>
        <div style={{ fontSize: 16, color: "#555" }}>{views[0]?.institute || ""}</div>
        <h1 style={{ fontSize: 36, fontFamily: "inherit" }}>Graduate CV Book</h1>
        <div style={{ fontSize: 18 }}>{batch.degreeProgram} · {batch.batchName}</div>
        <div style={{ marginTop: 30, color: "#555" }}>{views.length} graduates</div>
      </section>
      <section style={page}>
        <h2 style={{ fontFamily: "inherit" }}>Index</h2>
        <ol style={{ fontSize: 13.5, lineHeight: 1.7 }}>{views.map((v) => <li key={v.student.id}>{v.student.name} — {v.data.headline || v.student.batch.degreeProgram}{v.data.skills.length ? <span style={{ color: "#555" }}> · {v.data.skills.slice(0, 4).join(", ")}</span> : null}</li>)}</ol>
        {views.length === 0 && <p>No approved and shared CVs yet.</p>}
      </section>
      {views.map((v) => <CvDocument key={v.student.id} v={v} />)}
    </main>
  );
}
