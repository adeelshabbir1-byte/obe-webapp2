import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { exitCheck, lateralEntry, programs, UGEP } from "../../lib/adp";
import { Decide, Exit, KindRow } from "./AdpForms";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// Associate Degree (Adeel prompt §32, UGEP v1.1 V–VI): program kinds, lateral entry check, exit with an AD.
export default async function AdpPage({ searchParams }: { searchParams: { batch?: string; cgpa?: string; same?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const progs = await programs(cid);
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: { batchName: "desc" } });
  const batch = searchParams.batch ? batches.find((b) => b.id === searchParams.batch) : null;
  const students = batch ? await prisma.student.findMany({ where: { batchId: batch.id, status: "ACTIVE" }, select: { id: true }, take: 200 }) : [];
  const checks = batch ? (await Promise.all(students.map((s) => exitCheck(s.id)))).filter((x): x is NonNullable<typeof x> => !!x) : [];
  const pending = ((await db.exitAward?.findMany({ where: { status: "PENDING" }, take: 100 }).catch(() => [])) || []) as { id: string; studentId: string; checkJson: string }[];
  const pst = new Map((await prisma.student.findMany({ where: { id: { in: pending.map((p) => p.studentId).concat("none") }, batch: { coordinator: { managedById: cid } } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const controller = ((user as { extraRoles?: string[] }).extraRoles || []).includes("EXAM_CONTROLLER") || user.role === "CHAIRMAN";
  const lat = searchParams.cgpa ? lateralEntry(Number(searchParams.cgpa), searchParams.same !== "0") : null;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Associate Degree programs</h1>
      <p className="small-note">HEC UG Education Policy v1.1: an ADP is 4 semesters, {UGEP.adpMinCh}–{UGEP.adpMaxCh} CH (30 CH General Education, 30–42 CH Major), minimum CGPA {UGEP.minCgpa.toFixed(2)}, completed in 4–6 semesters; it needs statutory approval per seat of offering and PQR registration.</p>
      <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Program kinds</h3>{progs.map((p) => <div key={p.program} style={{ marginBottom: 4 }}><b style={{ minWidth: 200, display: "inline-block" }}>{p.program}</b> <KindRow program={p.program} kind={p.kind} feedsInto={p.feedsInto} discipline={p.discipline} programs={progs.map((x) => x.program)} /></div>)}</div>
      <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Lateral entry ADP → BS</h3>
        <form style={{ fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap" }}>ADP CGPA <input name="cgpa" defaultValue={searchParams.cgpa || ""} style={{ width: 60 }} /> <select name="same" defaultValue={searchParams.same || "1"}><option value="1">same discipline</option><option value="0">different discipline</option></select> <button className="btn btn-sm">Check</button></form>
        {lat && <p style={{ fontSize: 13, color: lat.ok ? "#1B6B3A" : "#B3261E" }}>{lat.text}</p>}
        <p className="small-note">The credit plan and exemptions are made on the student&apos;s transfer case (<Link href="/status-changes">Status changes</Link> → suggested matches).</p></div>
      <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Exit from BS with an Associate Degree</h3>
        <form style={{ fontSize: 13 }}><select name="batch" defaultValue={searchParams.batch || ""}><option value="">Choose a BS batch…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} {b.batchName}</option>)}</select> <button className="btn btn-sm">Check students</button></form>
        {checks.length > 0 && <table className="table" style={{ fontSize: 12, marginTop: 6, width: "100%" }}><tbody>{checks.map((c) => <tr key={c.student.id}><td>{c.student.rollNumber} {c.student.name}</td>{c.checks.map((k, i) => <td key={i} style={{ color: k.ok ? "#1B6B3A" : "#B3261E" }} title={k.label}>{k.ok ? "✓" : "✗"} {k.value}</td>)}<td>{c.ok && <Exit studentId={c.student.id} />}</td></tr>)}</tbody></table>}
        <p className="small-note">The AD carries the subject the student first enrolled in ({batch?.degreeProgram || "the BS program"}).</p></div>
      {pending.filter((p) => pst.has(p.studentId)).length > 0 && <div className="card"><h3 style={{ marginTop: 0, fontSize: 15 }}>Waiting for the Controller</h3><ul style={{ fontSize: 13 }}>{pending.filter((p) => pst.has(p.studentId)).map((p) => <li key={p.id}>{pst.get(p.studentId)!.rollNumber} {pst.get(p.studentId)!.name} {controller && <Decide id={p.id} />}</li>)}</ul></div>}
    </Shell>
  );
}
