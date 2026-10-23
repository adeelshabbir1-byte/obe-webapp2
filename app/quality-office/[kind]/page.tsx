import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import QualityShell from "../../../components/QualityShell";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { canEditQa, canViewQa, qaInstitute, qkind, records, rankingFacts, stagesOf, allStagesApproved, STAGES, ACTION_FIELDS, QA_HINT, type QRec } from "../../../lib/qaOffice";
import { formFields } from "../../../lib/qaOptions";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

export default async function QaKind({ params, searchParams }: { params: { kind: string }; searchParams: { open?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!canViewQa(user)) redirect("/home");
  const k = qkind(params.kind.toUpperCase());
  if (!k) redirect("/quality-office");
  const cid = await qaInstitute(user);
  const edit = canEditQa(user) || (user.role === "HEAD_OF_DEPARTMENT" && ["DEPT_REVIEW", "PROGRAM_PROPOSAL"].includes(k.key));
  const rows = await records(cid, k.key);
  const { form, show } = await formFields(user, cid, k.fields);
  const actionForm = (await formFields(user, cid, ACTION_FIELDS)).form;
  const listF = k.fields.filter((f) => f.list);
  const facts = k.key === "RANKING" ? await rankingFacts(cid).catch(() => null) : null;
  const t = today();
  const overdue = (r: QRec) => !!k.dueKey && !!r.data[k.dueKey] && r.data[k.dueKey] < t && !["Replied", "Closed", "Registered", "Affiliated", "Withdrawn"].includes(r.data.status);
  return (
    <QualityShell user={user} title={k.title} intro={k.what}>
      <p className="no-print"><Link href="/quality-office">← Quality Office</Link>{["PQR", "RANKING"].includes(k.key) && <> · <a href={`/api/qa-office?export=${k.key}`}>Download (Excel)</a></>}{k.key === "RANKING" && ["HEC", "THE", "QS"].map((r) => <span key={r}> · <a href={`/api/qa-office?export=RANKING&ranking=${r}`}>{r} only</a></span>)}</p>
      {!rows ? <div className="err">{QA_HINT}</div> : (
        <>
          {edit && <div className="card no-print"><ActionForm url="/api/qa-office" fixed={{ action: "save", kind: k.key }} fields={form} submit="Add" collapsed openLabel={`+ Add ${k.short.replace(/s$/, "").toLowerCase()}`}
            initial={facts ? { year: new Date().getFullYear(), faculty: facts.faculty, phdFaculty: facts.phdFaculty, students: facts.students, employers: facts.employers, graduates: facts.graduates, publications: facts.publications, status: "Collecting" } : {}} />
            {facts && <p className="small-note">The form starts with OBEHUB&apos;s own figures: {facts.faculty} faculty ({facts.phdFaculty} with a doctorate on their profile), {facts.students} active students, {facts.employers} employers, {facts.publications} publications last year.</p>}</div>}
          {rows.length === 0 ? <div className="card small-note">Nothing recorded yet.</div> : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ fontSize: 12.5 }}><thead><tr>{listF.map((f) => <th key={f.key}>{f.label}</th>)}<th></th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.id} style={{ background: overdue(r) ? "#FDE2E2" : searchParams.open === r.id ? "#FFF8E1" : undefined }}>
                    {listF.map((f) => <td key={f.key}>{show(f, r.data[f.key] || "") || "—"}{k.dueKey === f.key && overdue(r) ? <b style={{ color: "#C62828" }}> overdue</b> : null}</td>)}
                    <td><Link href={`/quality-office/${k.key.toLowerCase()}?open=${r.id}#r${r.id}`}>Open</Link></td>
                  </tr>
                ))}</tbody></table>
            </div>
          )}
          {rows.filter((r) => r.id === searchParams.open).map((r) => <Detail key={r.id} r={r} k={k} cid={cid} edit={edit} form={form} actionForm={actionForm} />)}
        </>
      )}
    </QualityShell>
  );
}

async function Detail({ r, k, cid, edit, form, actionForm }: { r: QRec; k: NonNullable<ReturnType<typeof qkind>>; cid: string; edit: boolean; form: Awaited<ReturnType<typeof formFields>>["form"]; actionForm: Awaited<ReturnType<typeof formFields>>["form"] }) {
  const acts = k.actions ? (await records(cid, "ACTION", r.id)) || [] : [];
  const st = k.key === "PROGRAM_PROPOSAL" ? await stagesOf(cid, r.id) : null;
  return (
    <div id={`r${r.id}`} className="card" style={{ borderLeft: "5px solid #1565C0" }}>
      <h3 style={{ marginTop: 0 }}>{r.data[k.titleKey] || k.title}</h3>
      {edit ? <ActionForm url="/api/qa-office" fixed={{ action: "save", kind: k.key, id: r.id }} fields={form} initial={r.data} submit="Save changes" />
        : <dl style={{ fontSize: 13 }}>{k.fields.map((f) => r.data[f.key] ? <div key={f.key}><dt className="small-note">{f.label}</dt><dd style={{ margin: "0 0 6px" }}>{r.data[f.key]}</dd></div> : null)}</dl>}
      {st && (
        <div style={{ marginTop: 12 }}>
          <h4>Approval stages</h4>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Stage</th><th>Date</th><th>Minute / letter no.</th><th>Decision</th><th>Note</th></tr></thead>
            <tbody>{STAGES.map(([sk, sl]) => <tr key={sk}><td>{sl}</td><td>{st.data[`${sk}_date`] || "—"}</td><td>{st.data[`${sk}_minute`] || "—"}</td><td style={{ fontWeight: 700, color: st.data[`${sk}_decision`] === "Approved" ? "#2E7D32" : st.data[`${sk}_decision`] === "Returned" ? "#C62828" : undefined }}>{st.data[`${sk}_decision`] || "Pending"}</td><td>{st.data[`${sk}_note`] || ""}</td></tr>)}</tbody></table>
          {edit && <ActionForm url="/api/qa-office" fixed={{ action: "save", kind: "STAGES", refId: r.id, ...(st.id ? { id: st.id } : {}) }} submit="Save stage" collapsed openLabel="Record a stage"
            fields={STAGES.flatMap(([sk, sl]) => [{ name: `${sk}_date`, label: `${sl} — date`, type: "date" as const }, { name: `${sk}_minute`, label: "Minute / letter no." }, { name: `${sk}_decision`, label: "Decision", type: "select" as const, options: [["", "Pending"], ["Approved", "Approved"], ["Returned", "Returned"]] as [string, string][] }, { name: `${sk}_note`, label: "Note" }])} initial={st.data} />}
          {edit && r.data.status !== "Created" && allStagesApproved(st.data) && <ActionButton url="/api/qa-office" body={{ action: "createProgram", id: r.id }} label="Create this program in OBEHUB" confirmText="Create the degree program now?" />}
        </div>
      )}
      {k.actions && (
        <div style={{ marginTop: 12 }}>
          <h4>Action plan</h4>
          {acts.length === 0 ? <p className="small-note">No actions yet.</p> : <table style={{ fontSize: 12.5 }}><thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>{acts.map((a) => <tr key={a.id}><td>{a.data.action}</td><td>{a.data.owner}</td><td>{a.data.due}</td><td>{a.data.status || "Open"}</td><td>{edit && <ActionForm url="/api/qa-office" fixed={{ action: "save", kind: "ACTION", id: a.id }} fields={actionForm} initial={a.data} submit="Save" collapsed openLabel="Edit" />}</td></tr>)}</tbody></table>}
          {edit && <ActionForm url="/api/qa-office" fixed={{ action: "save", kind: "ACTION", refId: r.id }} fields={actionForm} initial={{ status: "Open" }} submit="Add action" collapsed openLabel="+ Add action" />}
        </div>
      )}
      {edit && <div style={{ marginTop: 10 }}><ActionButton url="/api/qa-office" body={{ action: "delete", id: r.id }} label="Delete" className="btn btn-secondary btn-sm" confirmText="Delete this record and its actions?" /></div>}
    </div>
  );
}
