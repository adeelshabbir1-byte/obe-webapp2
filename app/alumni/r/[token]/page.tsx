import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/db";
import { requestByToken } from "../../../../lib/alumniVoice";
import { ActionForm } from "../../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "A request from your university" };

// What an alumnus opens from a faculty member's request link.
export default async function AlumniRequestPage({ params }: { params: { token: string } }) {
  const r = await requestByToken(params.token);
  if (!r) notFound();
  const [al, by] = await Promise.all([prisma.alumni.findUnique({ where: { id: r.alumniId }, select: { name: true, email: true } }), prisma.user.findUnique({ where: { id: r.requestedById }, select: { name: true } })]);
  const qs = (() => { try { return JSON.parse(r.questionsJson) as string[]; } catch { return []; } })();
  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EA", padding: 20, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", padding: "30px 34px", maxWidth: 640, width: "100%", border: "1px solid #E4DFCE" }}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Hello {al?.name}</h1>
        {r.respondedAt ? <p>Thank you — your reply has been recorded.</p> : <>
          <p style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{r.message}</p>
          <p className="small-note">— {by?.name}</p>
          <ActionForm url="/api/alumni/public" fixed={{ action: "answer", token: params.token }} submit="Send" done="Thank you — recorded."
            initial={{ email: al?.email || "" }}
            fields={[
              ...qs.map((q, i) => ({ name: `q${i}`, label: q, type: "textarea" as const })),
              { name: "employer", label: "Where you work now", width: 260 }, { name: "jobTitle", label: "Your job title", width: 220 },
              { name: "degree", label: "Any further degree (name, university, year)", width: 360 }, { name: "email", label: "Email to keep in touch", width: 260 },
            ]} />
        </>}
      </div>
    </div>
  );
}
