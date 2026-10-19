import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { FDP_KINDS } from "../../../../lib/fdp";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";
const fdb = prisma as unknown as Record<string, any>;

// A printable certificate of attendance for one FDP session.
export default async function Certificate({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const a = await fdb.fdpAttendance.findUnique({ where: { id: params.id } }).catch(() => null);
  if (!a) notFound();
  const s = await fdb.fdpSession.findUnique({ where: { id: a.sessionId } });
  if (!s || (a.userId !== user.id && (await chairmanIdFor(user)) !== s.chairmanId)) notFound();
  const [who, head] = await Promise.all([prisma.user.findUnique({ where: { id: a.userId }, select: { name: true, department_: { select: { name: true } } } }), prisma.user.findUnique({ where: { id: s.chairmanId }, select: { name: true, instituteName: true } })]);
  return (
    <div style={{ maxWidth: 820, margin: "30px auto", padding: 40, border: "6px double #8a6d2b", textAlign: "center", fontFamily: "Georgia, serif", background: "#fff", color: "#222" }}>
      <div style={{ fontSize: 14, letterSpacing: 2 }}>{head?.instituteName || ""}</div>
      <h1 style={{ fontSize: 34, margin: "18px 0 6px" }}>Certificate of Participation</h1>
      <p style={{ fontSize: 15 }}>This is to certify that</p>
      <p style={{ fontSize: 26, fontWeight: 700, margin: "6px 0" }}>{who?.name}</p>
      <p style={{ fontSize: 14 }}>{who?.department_?.name || ""}</p>
      <p style={{ fontSize: 15, lineHeight: 1.6 }}>attended the {(FDP_KINDS[s.kind] || "session").toLowerCase()} <b>“{s.title}”</b><br />held on {new Date(s.date).toDateString()}{s.venue ? ` at ${s.venue}` : ""}{s.facilitator ? `, conducted by ${s.facilitator}` : ""},<br />earning <b>{s.hours} hour(s)</b> of faculty development.</p>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 50, fontSize: 13 }}>
        <span>Certificate No. {a.certificateNo}</span>
        <span style={{ borderTop: "1px solid #444", paddingTop: 4, minWidth: 200 }}>{head?.name || "Head of Institute"}</span>
      </div>
      <div style={{ marginTop: 20 }} className="no-print"><PrintButton /></div>
    </div>
  );
}
