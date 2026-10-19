import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/db";
import { alumniByToken, voicesOf } from "../../../../lib/alumniVoice";
import { ActionForm } from "../../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alumni corner" };

// An alumnus's own corner: suggest changes to the curriculum or a course, offer a workshop, see the replies.
export default async function AlumniCornerPage({ params }: { params: { token: string } }) {
  const al = await alumniByToken(params.token);
  if (!al) notFound();
  const [mine, courses] = await Promise.all([
    voicesOf({ alumniId: al.id }),
    prisma.course.findMany({ where: { batch: { degreeProgram: al.degreeProgram }, coordinator: { managedById: al.chairmanId } }, select: { code: true, title: true }, distinct: ["code"], orderBy: { code: "asc" }, take: 200 }),
  ]);
  const opts: [string, string][] = [["", "The curriculum as a whole"], ...courses.map((c) => [c.code, `${c.code} ${c.title}`] as [string, string])];
  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EA", padding: 20, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", padding: "30px 34px", maxWidth: 760, width: "100%", border: "1px solid #E4DFCE" }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Alumni corner — {al.name}</h1>
        <p className="small-note">{al.degreeProgram}, class of {al.graduationYear}. What you learned at work helps today&apos;s students: suggest changes to the curriculum or a course, or offer a workshop or talk. Every faculty member of the program sees your suggestions.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
          <ActionForm url="/api/alumni/public" fixed={{ action: "suggest", me: params.token }} submit="Send suggestion" collapsed openLabel="Suggest a change" done="Sent — thank you."
            initial={{ courseCode: "" }} fields={[{ name: "courseCode", label: "About", type: "select", options: opts, width: 320 }, { name: "title", label: "In one line", width: 400 }, { name: "text", label: "What should change, and why (what industry needs)", type: "textarea" }]} />
          <ActionForm url="/api/alumni/public" fixed={{ action: "workshop", me: params.token }} submit="Offer" collapsed openLabel="Offer a workshop or talk" done="Offered — Student Affairs will get back to you."
            fields={[{ name: "title", label: "Topic", width: 360 }, { name: "audience", label: "For whom (semester, program)", width: 260 }, { name: "preferredDates", label: "Dates that suit you", width: 260 }, { name: "text", label: "What you will cover, and how (on campus / online)", type: "textarea" }]} />
        </div>
        {mine && mine.length > 0 && (
          <table style={{ fontSize: 13, width: "100%" }}><thead><tr><th>Yours</th><th>Status</th><th>Reply</th></tr></thead>
            <tbody>{mine.map((v) => <tr key={v.id}><td>{v.kind === "WORKSHOP" ? "Workshop: " : ""}{v.title}{v.courseCode ? ` (${v.courseCode})` : ""}<div className="small-note">{v.createdAt.toISOString().slice(0, 10)}</div></td><td>{v.status.toLowerCase().replace("_", " ")}{v.scheduledFor ? ` — ${v.scheduledFor.toISOString().slice(0, 10)}` : ""}</td><td className="small-note">{v.reply || "—"}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}
