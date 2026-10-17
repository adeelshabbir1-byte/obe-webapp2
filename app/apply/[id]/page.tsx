import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import PublicInquiryForm from "../../../components/PublicInquiryForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admission inquiry" };

// Public admission inquiry form (link it from the institute's website).
export default async function ApplyPage({ params }: { params: { id: string } }) {
  const head = await prisma.user.findFirst({ where: { id: params.id, role: "CHAIRMAN" as never }, select: { id: true, instituteName: true } });
  if (!head) notFound();
  const programs = Array.from(new Set((await prisma.degreeProgram.findMany({ where: { coordinator: { managedById: head.id } }, select: { name: true } })).map((p) => p.name)));
  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 20 }}>
      <div className="card"><h1 style={{ fontSize: 22, marginTop: 0 }}>{head.instituteName || "Admissions"} — admission inquiry</h1>
        <p className="small-note">Leave your details and our admissions office will contact you.</p>
        <PublicInquiryForm institute={head.id} programs={programs} /></div>
    </main>
  );
}
