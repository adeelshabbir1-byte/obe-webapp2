import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import ExitSurveyForm from "../../../components/ExitSurveyForm";
import { exdb, FORMS } from "../../../lib/exitSurveys";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exit survey" };

export default async function ExitPage({ params }: { params: { token: string } }) {
  const s = (await exdb.exitSurvey.findUnique({ where: { token: params.token } }).catch(() => null)) as { kind: string; chairmanId: string; subjectName: string; submittedAt: Date | null } | null;
  if (!s || !FORMS[s.kind]) notFound();
  const inst = await prisma.user.findUnique({ where: { id: s.chairmanId }, select: { instituteName: true } });
  const f = FORMS[s.kind];
  return (
    <main style={{ maxWidth: 640, margin: "32px auto", padding: 16 }}>
      <div className="card"><div className="small-note">{inst?.instituteName || ""}</div><h1 style={{ fontSize: 21, marginTop: 4 }}>{f.title}</h1><p style={{ fontSize: 14 }}>Dear {s.subjectName}, {f.intro}</p>
        {s.submittedAt ? <p style={{ color: "#1F5E36" }}>Already submitted. Thank you.</p> : <ExitSurveyForm token={params.token} form={f} />}</div>
    </main>
  );
}
