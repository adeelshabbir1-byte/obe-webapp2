import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { rdb2 } from "../../../lib/recruitment";
import JobApplicationForm from "../../../components/JobApplicationForm";

export const dynamic = "force-dynamic";

// Public: the advertisement and its application form (no sign-in).
export default async function JobPage({ params }: { params: { token: string } }) {
  const ad = await rdb2.jobAdvert.findUnique({ where: { token: params.token } }).catch(() => null);
  if (!ad) notFound();
  const head = await prisma.user.findUnique({ where: { id: ad.chairmanId }, select: { instituteName: true } });
  const open = ad.status === "OPEN" && new Date(ad.closeAt) >= new Date();
  return (
    <main style={{ minHeight: "100vh", background: "#F7F2F1", padding: "28px 16px", fontFamily: "Arial, sans-serif", color: "#221" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 12, padding: 22 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, color: "#7A1F2B", fontWeight: 700 }}>{(head?.instituteName || "").toUpperCase()} · CAREERS</div>
        <h1 style={{ fontSize: 24, margin: "6px 0 10px" }}>{ad.title}</h1>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.6, marginBottom: 18 }}>{ad.text}</div>
        {open ? <JobApplicationForm token={params.token} /> : <p style={{ fontWeight: 700, color: "#B3261E" }}>Applications for this position are closed.</p>}
      </div>
    </main>
  );
}
