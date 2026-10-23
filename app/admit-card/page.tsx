import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { getAuthenticatedStudent } from "../../lib/studentSession";
import { prisma } from "../../lib/db";
import { admitCards, controllerChairman, xdb } from "../../lib/examController";
import PrintButton from "../../components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admit card" };

// Admit cards: the Controller prints a batch's cards (?session=&batch=); a student prints their own (?session= optional).
export default async function AdmitCard({ searchParams }: { searchParams: { session?: string; batch?: string } }) {
  const user = await getAuthenticatedUser().catch(() => null);
  let ids: string[] = [], sessionId = searchParams.session || "", institute = "";
  if (user && (await controllerChairman(user))) {
    const cid = (await controllerChairman(user))!;
    if (!searchParams.batch) redirect("/controller?tab=debar");
    const b = await prisma.batch.findFirst({ where: { id: searchParams.batch, coordinator: { managedById: cid } }, select: { students: { select: { id: true } } } });
    ids = b?.students.map((s) => s.id) || [];
    institute = (await prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true } }).catch(() => null))?.instituteName || "";
  } else {
    const st = await getAuthenticatedStudent();
    if (!st) redirect("/student/login");
    ids = [st.id];
    const fee = await (await import("../../lib/feeClearance")).feeBlock(st.id, "admitCard");
    if (fee) return <div style={{ maxWidth: 600, margin: "40px auto", padding: 20, fontFamily: "Arial", border: "2px solid #C62828", borderRadius: 6 }}><b>Admit card withheld</b><p>{fee}</p><a href="/student/fees">Go to My Fees</a></div>;
    const s = await prisma.student.findUnique({ where: { id: st.id }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
    const cid = s?.batch.coordinator.managedById || "";
    if (!sessionId) sessionId = ((await xdb.examSession.findFirst({ where: { chairmanId: cid, status: "PUBLISHED" }, orderBy: { startDate: "desc" }, select: { id: true } }).catch(() => null)) as { id: string } | null)?.id || "";
    institute = (await prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true } }).catch(() => null))?.instituteName || "";
  }
  const data = sessionId ? await admitCards(sessionId, ids) : null;
  if (!data) return <div style={{ padding: 30 }}>No published exam session yet.</div>;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 16, fontFamily: "Arial, sans-serif" }}>
      <div className="no-print" style={{ marginBottom: 12 }}><PrintButton /></div>
      {await Promise.all(data.cards.map(async (c) => ({ c, fee: await (await import("../../lib/feeClearance")).feeBlock(c.student.id, "admitCard") }))).then((xs) => xs.filter((x) => x.fee).length ? <p className="no-print" style={{ color: "#C62828" }}>Fee outstanding (cards marked WITHHELD): {xs.filter((x) => x.fee).map((x) => x.c.student.rollNumber).join(", ")}</p> : null)}
      {data.cards.map((c) => (
        <div key={c.student.id} style={{ border: "2px solid #0D2A4A", borderRadius: 6, padding: 16, marginBottom: 18, pageBreakInside: "avoid", breakInside: "avoid" }}>
          <div style={{ textAlign: "center", borderBottom: "1px solid #999", paddingBottom: 6, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{institute || "Office of the Controller of Examinations"}</div>
            <div style={{ fontWeight: 700 }}>ADMIT CARD — {data.session.name}</div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
            <span>Name: <b>{c.student.name}</b></span><span>Roll No: <b>{c.student.rollNumber}</b></span><span>Program: <b>{c.student.batch.degreeProgram} — {c.student.batch.batchName}</b></span>
          </div>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead><tr>{["Date", "Time", "Course", "Room", ""].map((h) => <th key={h} style={{ border: "1px solid #999", padding: 4, background: "#EEF2F7", textAlign: "left" }}>{h}</th>)}</tr></thead>
            <tbody>{c.papers.length === 0 ? <tr><td colSpan={5} style={{ padding: 6 }}>No papers scheduled.</td></tr> : c.papers.map((p, i) => (
              <tr key={i} style={{ textDecoration: p.debarred ? "line-through" : undefined, color: p.debarred ? "#C62828" : undefined }}>
                <td style={{ border: "1px solid #999", padding: 4 }}>{p.date ? new Date(p.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "TBA"}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{p.slot || "—"}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}><b>{p.code}</b> {p.title}</td>
                <td style={{ border: "1px solid #999", padding: 4 }}>{p.room || "—"}</td>
                <td style={{ border: "1px solid #999", padding: 4, textDecoration: "none" }}>{p.debarred ? "DEBARRED" : ""}</td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{ fontSize: 11, marginTop: 8, color: "#444" }}>Bring this card and your university ID to every paper. Mobile phones and notes are not allowed in the hall.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 26, fontSize: 12 }}><span style={{ borderTop: "1px solid #000", paddingTop: 2 }}>Controller of Examinations</span></div>
        </div>
      ))}
    </div>
  );
}
