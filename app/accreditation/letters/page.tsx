import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { govScope, inScope } from "../../../lib/accreditation/governance";
import * as F from "../../../lib/facultyStatus";
import { LetterForm, PostButton } from "../../../components/FacultyStatusForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Letters with NCEAC / HEC" };

// Queue item 23: the documents exchanged with NCEAC, HEC, NBEAC and other councils — visit reports, rebuttals,
// decisions, NOCs, applications, queries — each with its date, reference number, program, visit and file.
export default async function Letters() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const sc = await govScope(user as never);
  if (!sc) redirect("/home");
  const [rows, cycles] = await Promise.all([F.letters(sc.chairmanId), prisma.accreditationCycle.findMany({ where: { chairmanId: sc.chairmanId }, orderBy: { createdAt: "desc" } })]);
  const mine = cycles.filter((c) => inScope(sc, c));
  const programs: string[] = Array.from(new Set<string>(mine.map((c) => c.program as string))).sort();
  const cyc = new Map(cycles.map((c) => [c.id, `${c.program} — ${c.title}`]));
  const shown = (rows || []).filter((r) => !sc.departmentIds || !r.program || programs.includes(r.program));
  return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Letters with NCEAC / HEC</h1>
    {rows === null ? <div className="card err">{F.FST_HINT}</div> : <>
      <div className="card"><h3 style={{ marginTop: 0 }}>Add a letter or document</h3><LetterForm kinds={F.LETTER_KINDS} programs={programs} cycles={mine.map((c) => ({ id: c.id, label: `${c.program} — ${c.title}` }))} /></div>
      <div className="card" style={{ overflowX: "auto" }}>{!shown.length ? <p className="small-note">Nothing recorded yet.</p> :
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Date</th><th>With</th><th></th><th>Kind</th><th>Ref.</th><th>Subject</th><th>Program / visit</th><th>File</th><th></th></tr></thead>
          <tbody>{shown.map((r) => <tr key={r.id}><td>{r.letterDate ? r.letterDate.toISOString().slice(0, 10) : r.at.toISOString().slice(0, 10)}</td><td>{r.counterpart}</td><td>{r.direction === "IN" ? "received" : "sent"}</td><td>{r.kind}</td><td>{r.refNo || "—"}</td><td>{r.subject}</td>
            <td>{r.cycleId ? <Link href={`/accreditation/visit/${r.cycleId}`}>{cyc.get(r.cycleId) || "visit"}</Link> : r.program || "institute"}</td><td>{r.fileUrl ? <a href={r.fileUrl} target="_blank" rel="noreferrer">{r.fileName || "open"}</a> : "—"}</td>
            <td>{sc.canManage && <PostButton body={{ action: "letter-remove", id: r.id }} label="remove" confirm="Remove this letter from the register?" />}</td></tr>)}</tbody></table>}</div></>}
  </Shell>;
}
