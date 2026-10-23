import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, rdb, day } from "../../lib/registers";
import { DEG_HINT, OFFICES, REQUESTERS, RESPONSES, canManageDegrees, allCleared, candidates, type Clearance } from "../../lib/degrees";
import { degreeAudit } from "../../lib/transcriptPlus";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TABS = [["clearance", "Clearance"], ["register", "Degree register"], ["convocations", "Convocations"], ["verify", "Verification requests"]] as const;
type Issue = { id: string; studentId: string | null; rollNumber: string; studentName: string; fatherName: string | null; program: string; degreeTitle: string; cgpa: number | null; serialNo: string; issuedAt: Date; convocationId: string | null; cancelledAt: Date | null; cancelNote: string | null };

// Degree issuance and verification: clearance by each office → degree audit → serial register → convocation list;
// verification requests answered from the register.
export default async function DegreesPage({ searchParams }: { searchParams: { tab?: string; batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !(canManageDegrees(w) || w.leader || w.lead || w.librarian || w.finance || w.affairs)) redirect("/dashboard");
  const tab = TABS.some((t) => t[0] === searchParams.tab) ? searchParams.tab! : "clearance";
  const manage = canManageDegrees(w);
  let ready = true; try { await rdb.convocation.count({ where: { chairmanId: w.chairmanId } }); } catch { ready = false; }
  const convs = ready ? ((await rdb.convocation.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { date: "desc" } })) as { id: string; title: string; date: Date; venue: string | null }[]) : [];
  const head = <>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Degrees</h1>
    <p className="small-note" style={{ marginBottom: 10 }}>Clearance by the library, fee office, hostel and department → degree audit → serial number in the degree register → convocation list. Verification requests from HEC and employers are answered from the register.</p>
    <HowCalculated shows="A degree is issued only when all four offices have cleared the student and the degree audit passes (all required courses passed, minimum CGPA and credit hours).">
      <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
        <li>Each office clears its own part: Library (Librarian), Fee office (Finance Officer), Hostel (Student Affairs; mark “not a resident” when it does not apply), Department (HOD or Program Lead).</li>
        <li>Serial numbers run per year: <i>PREFIX-YEAR-0001</i>, where the prefix is the institute&apos;s HEMIS code when set.</li>
        <li>A verification request is matched by the degree serial, then by roll number; the name is compared too. The answer is recorded with who gave it and when.</li>
      </ul>
    </HowCalculated>
    {!ready && <div className="err">{DEG_HINT}</div>}
    <div role="tablist" className="tabs no-print">{TABS.map(([k, l]) => <a key={k} role="tab" className="tab" aria-selected={tab === k} href={`?tab=${k}`}>{l}</a>)}</div>
  </>;
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{head}{x}</Shell>;
  const issues = ready ? ((await rdb.degreeIssue.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { issuedAt: "desc" } })) as Issue[]) : [];

  if (tab === "clearance") {
    const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: w.chairmanId }, ...(w.lead ? { coordinatorId: w.id } : {}) }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: { startYear: "asc" } });
    const sel = batches.find((b) => b.id === searchParams.batch)?.id;
    const st = (await candidates(w.chairmanId, sel)).filter((s) => !w.lead || batches.some((b) => b.degreeProgram === s.batch.degreeProgram && b.batchName === s.batch.batchName));
    const cls = ready ? new Map(((await rdb.degreeClearance.findMany({ where: { studentId: { in: st.map((s) => s.id).concat(["none"]) } } })) as Clearance[]).map((c) => [c.studentId, c])) : new Map<string, Clearance>();
    const audits = await Promise.all(st.slice(0, 120).map(async (s) => [s.id, (await degreeAudit(s.id).catch(() => null))?.eligible ?? false] as const));
    const aud = new Map(audits);
    const issued = new Set(issues.filter((i) => !i.cancelledAt && i.studentId).map((i) => i.studentId));
    return shell(<>
      <form className="card no-print" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><label style={{ fontSize: 12 }}>Batch<br /><select name="batch" defaultValue={sel || ""}><option value="">All final-year and graduated students</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select></label><input type="hidden" name="tab" value="clearance" /><button className="btn btn-secondary btn-sm">Show</button></form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Student</th>{OFFICES.map((o) => <th key={o.key}>{o.label}</th>)}<th>Degree audit</th><th>Degree</th></tr></thead>
          <tbody>{st.map((s) => { const c = cls.get(s.id); const ok = allCleared(c); return (
            <tr key={s.id}><td><b>{s.name}</b><div className="small-note" style={{ margin: 0 }}>{s.rollNumber} · {s.batch.degreeProgram} {s.batch.batchName}</div></td>
              {OFFICES.map((o) => { const at = c?.[`${o.key}At`] as Date | null | undefined; const note = c?.[`${o.key}Note`] as string | null | undefined; return (
                <td key={o.key}>{at ? <span style={{ color: "#1E6B3A", fontWeight: 700 }}>✓ {day(at)}</span> : <span style={{ color: "#9A3412" }}>pending</span>}{note && <div className="small-note" style={{ margin: 0 }}>{note}</div>}
                  {o.can(w) && <div>{at ? <ActionButton url="/api/degrees" body={{ action: "clear", studentId: s.id, office: o.key, undo: true }} label="Withdraw" className="act" confirmText="Withdraw this clearance?" /> : <ActionButton url="/api/degrees" body={{ action: "clear", studentId: s.id, office: o.key }} label="Clear" className="act" askNote={o.key === "hostel" ? "Note (e.g. not a hostel resident)" : "Note (optional)"} />}</div>}</td>); })}
              <td style={{ fontWeight: 700, color: aud.get(s.id) ? "#1E6B3A" : "#B3261E" }}>{aud.get(s.id) ? "✓ passes" : "not yet"}</td>
              <td>{issued.has(s.id) ? <b style={{ color: "#1E6B3A" }}>Issued</b> : manage && ok && aud.get(s.id) ? <ActionForm url="/api/degrees" fixed={{ action: "issue", studentId: s.id }} submit="Issue" collapsed openLabel="Issue degree" initial={{ degreeTitle: s.batch.degreeProgram }} fields={[{ name: "degreeTitle", label: "Degree title", width: 200 }, { name: "convocationId", label: "Convocation", type: "select", options: convs.map((c) => [c.id, `${c.title} (${day(c.date)})`] as [string, string]) }]} /> : <span className="small-note">{!ok ? "waiting for clearance" : "audit not passed"}</span>}</td></tr>); })}
            {!st.length && <tr><td colSpan={7}>No final-year or graduated students{sel ? " in this batch" : ""}.</td></tr>}</tbody></table>
      </div>
    </>);
  }

  if (tab === "register") return shell(<>
    {manage && <div className="card"><h3 style={{ marginTop: 0 }}>Add a degree issued before OBEHUB</h3><ActionForm url="/api/degrees" fixed={{ action: "legacy" }} submit="Add to register" collapsed openLabel="Add an earlier degree" fields={[{ name: "serialNo", label: "Serial no.", width: 140 }, { name: "rollNumber", label: "Roll no.", width: 140 }, { name: "studentName", label: "Name", width: 180 }, { name: "fatherName", label: "Father's name", width: 180 }, { name: "program", label: "Program", width: 180 }, { name: "degreeTitle", label: "Degree title", width: 200 }, { name: "cgpa", label: "CGPA", type: "number", width: 70 }, { name: "issuedAt", label: "Issued on", type: "date" }]} /></div>}
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ margin: 0 }}>Degree register</h3><span className="small-note">{issues.filter((i) => !i.cancelledAt).length} degrees</span><span className="small-note no-print" style={{ marginLeft: "auto" }}>Print this page (Ctrl+P) for the signed register.</span></div>
      <table className="table" style={{ fontSize: 13, marginTop: 8 }}><thead><tr><th>Serial</th><th>Name</th><th>Roll no.</th><th>Program / degree</th><th>CGPA</th><th>Issued</th><th>Convocation</th><th></th></tr></thead>
        <tbody>{issues.map((i) => <tr key={i.id} style={{ opacity: i.cancelledAt ? 0.55 : 1 }}><td><b>{i.serialNo}</b></td><td>{i.studentName}{i.fatherName ? <div className="small-note" style={{ margin: 0 }}>s/d/o {i.fatherName}</div> : null}</td><td>{i.rollNumber}</td><td>{i.degreeTitle}{i.degreeTitle !== i.program ? <div className="small-note" style={{ margin: 0 }}>{i.program}</div> : null}</td><td>{i.cgpa ?? "—"}</td><td>{day(i.issuedAt)}{i.studentId ? "" : <div className="small-note" style={{ margin: 0 }}>before OBEHUB</div>}</td>
          <td>{i.cancelledAt ? <span style={{ color: "#B3261E" }}>Cancelled: {i.cancelNote}</span> : manage ? <ActionForm url="/api/degrees" fixed={{ action: "assign", id: i.id }} submit="Save" collapsed openLabel={convs.find((c) => c.id === i.convocationId)?.title || "Assign"} initial={{ convocationId: i.convocationId || "" }} fields={[{ name: "convocationId", label: "Convocation", type: "select", options: convs.map((c) => [c.id, c.title] as [string, string]) }]} /> : convs.find((c) => c.id === i.convocationId)?.title || "—"}</td>
          <td>{manage && !i.cancelledAt && <ActionButton url="/api/degrees" body={{ action: "cancel", id: i.id }} label="Cancel" className="act" askNote="Reason for cancelling (e.g. reissued after a correction)" noteRequired />}</td></tr>)}
          {!issues.length && <tr><td colSpan={8}>The register is empty.</td></tr>}</tbody></table>
    </div>
  </>);

  if (tab === "convocations") return shell(<>
    {manage && <div className="card"><ActionForm url="/api/degrees" fixed={{ action: "convocation" }} submit="Add" collapsed openLabel="Add a convocation" fields={[{ name: "title", label: "Title", placeholder: "4th Convocation", width: 200 }, { name: "date", label: "Date", type: "date" }, { name: "venue", label: "Venue", width: 200 }]} /></div>}
    {convs.map((c) => { const list = issues.filter((i) => i.convocationId === c.id && !i.cancelledAt); return (
      <div key={c.id} className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>{c.title} — {day(c.date)}{c.venue ? `, ${c.venue}` : ""} <span className="small-note">{list.length} graduates</span></h3>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>#</th><th>Name</th><th>Roll no.</th><th>Degree</th><th>CGPA</th><th>Serial</th></tr></thead>
          <tbody>{list.sort((a, b) => a.program.localeCompare(b.program) || (b.cgpa ?? 0) - (a.cgpa ?? 0)).map((i, n) => <tr key={i.id}><td>{n + 1}</td><td>{i.studentName}</td><td>{i.rollNumber}</td><td>{i.degreeTitle}</td><td>{i.cgpa ?? "—"}</td><td>{i.serialNo}</td></tr>)}
            {!list.length && <tr><td colSpan={6}>Nobody assigned yet (Degree register → Convocation).</td></tr>}</tbody></table></div>); })}
    {!convs.length && <div className="card">No convocation planned yet.</div>}
  </>);

  const reqs = ready ? ((await rdb.degreeVerification.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { receivedAt: "desc" }, take: 200 })) as { id: string; requesterKind: string; requesterName: string; reference: string | null; rollNumber: string | null; serialNo: string | null; studentName: string | null; receivedAt: Date; degreeIssueId: string | null; response: string | null; responseNote: string | null; respondedAt: Date | null }[]) : [];
  return shell(<>
    {(manage || w.leader) && <div className="card"><h3 style={{ marginTop: 0 }}>Log a verification request</h3><ActionForm url="/api/degrees" fixed={{ action: "request" }} submit="Log request" collapsed openLabel="New request" fields={[{ name: "requesterKind", label: "From", type: "select", options: Object.entries(REQUESTERS) }, { name: "requesterName", label: "Name of the body", width: 200 }, { name: "reference", label: "Their reference", width: 140 }, { name: "serialNo", label: "Degree serial", width: 140 }, { name: "rollNumber", label: "Roll no.", width: 140 }, { name: "studentName", label: "Name on the degree", width: 180 }, { name: "receivedAt", label: "Received on", type: "date" }]} /></div>}
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Received</th><th>From</th><th>Degree asked about</th><th>In our register</th><th>Answer</th><th></th></tr></thead>
        <tbody>{reqs.map((r) => { const hit = issues.find((i) => i.id === r.degreeIssueId); return (
          <tr key={r.id}><td>{day(r.receivedAt)}</td><td><b>{r.requesterName}</b><div className="small-note" style={{ margin: 0 }}>{REQUESTERS[r.requesterKind]}{r.reference ? ` · ref ${r.reference}` : ""}</div></td><td>{[r.serialNo, r.rollNumber, r.studentName].filter(Boolean).join(" · ")}</td>
            <td>{hit ? <>{hit.serialNo} · {hit.studentName} · {hit.degreeTitle}{hit.cancelledAt ? <span style={{ color: "#B3261E" }}> (cancelled)</span> : null}</> : <span style={{ color: "#B3261E" }}>no match</span>}</td>
            <td style={{ fontWeight: 700, color: r.response === "VERIFIED" ? "#1E6B3A" : r.response ? "#B3261E" : "#9A3412" }}>{r.response ? `${RESPONSES[r.response]} (${day(r.respondedAt)})` : "not answered"}{r.responseNote && <div className="small-note" style={{ margin: 0, fontWeight: 400 }}>{r.responseNote}</div>}</td>
            <td>{manage && !r.response && <ActionForm url="/api/degrees" fixed={{ action: "respond", id: r.id }} submit="Send answer" collapsed openLabel="Answer" initial={{ response: hit && !hit.cancelledAt ? "VERIFIED" : "NOT_FOUND" }} fields={[{ name: "response", label: "Answer", type: "select", options: Object.entries(RESPONSES) }, { name: "responseNote", label: "Note", width: 220 }]} />}</td></tr>); })}
          {!reqs.length && <tr><td colSpan={6}>No requests yet.</td></tr>}</tbody></table>
    </div>
  </>);
}
