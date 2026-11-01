import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import MathText from "../../../components/MathText";
import PaperValueEditor from "../../../components/PaperValueEditor";
import { touch, layoutOf, logOf, security, autoFill, valuesOf } from "../../../lib/paperTemplates";
import { FIELD_LABEL } from "../../../lib/paperTemplateCore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exam paper" };

// One paper in its template. Opening an official (mid / final) paper is logged; after vetting it is locked until exam
// day (only the HOD and the Controller open it; only the Controller prints or downloads). The setter, the HOD and the
// Controller see who has seen it.
export default async function PaperPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{c}</Shell>;
  let s: Awaited<ReturnType<typeof security>>;
  try { s = await security(user as never, params.id); } catch (e) { return shell(<div className="err">{(e as Error).message}</div>); }
  const log = s.viewer.isSetter || s.viewer.isHod || s.viewer.isController ? await logOf(params.id) : null;
  if (!s.open) return shell(<>
    <h1 style={{ fontSize: 22 }}>Exam paper</h1>
    <div className="card" data-paper-locked><b>{s.lockedNow ? "This paper is locked until exam day: only the HOD and the Controller can open it." : "You cannot open this paper."}</b></div>
    {log && <div className="card small-note" data-seen-by>{log.line}</div>}
  </>);
  await touch(user as never, params.id, "OPENED");
  const { l } = await layoutOf(params.id);
  const after = s.viewer.isSetter || s.viewer.isHod || s.viewer.isController ? await logOf(params.id) : null;
  const editable = s.viewer.isSetter && !s.lockedNow;
  const auto = editable ? (await autoFill(params.id)).auto : {};
  const vals = editable ? await valuesOf(params.id) : {};
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>{l.title}</h1>
    {s.official && <p className="small-note">{s.lockedNow ? "Locked after vetting until exam day." : s.locked ? "Vetted." : "Official paper (vetting in progress)."} Every opening, print and download is logged.</p>}
    {after && <div className="card small-note" data-seen-by>{after.line}</div>}
    <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
      {s.download && <a className="btn btn-sm" href={`/api/paper?paper=${params.id}&format=pdf`} target="_blank" rel="noreferrer" data-print>Print (PDF)</a>}
      {s.download && <a className="btn btn-secondary btn-sm" href={`/api/paper?paper=${params.id}&format=docx`} data-download>Download (Word)</a>}
    </div>
    <div className="card" data-paper>
      <table style={{ fontSize: 13, marginBottom: 8 }}><tbody>{l.header.map(([k, v]) => <tr key={k}><td style={{ fontWeight: 600, paddingRight: 12 }}>{k}</td><td data-field={k}>{v}</td></tr>)}</tbody></table>
      {editable && <PaperValueEditor paperId={params.id} fields={Object.keys(FIELD_LABEL).map((k) => ({ key: k, label: FIELD_LABEL[k], value: vals[k] ?? auto[k] ?? "" }))} />}
      {l.rollBoxes && <p style={{ fontSize: 13 }}>Roll number: ____________ &nbsp; Name: ______________________</p>}
      {l.instructions && <div style={{ fontSize: 13, marginBottom: 8 }}><b>Instructions</b><div><MathText text={l.instructions} /></div></div>}
      {(l.sections || []).map((sec, i) => (
        <div key={i}>{sec.title && <h3 style={{ fontSize: 15, marginBottom: 2 }}>{sec.title}</h3>}{sec.note && <p className="small-note">{sec.note}</p>}
          {sec.questions.map((q) => <div key={q.no} style={{ margin: "8px 0", fontSize: 13.5 }} data-paper-q={q.no}><b>{q.no}</b> <MathText text={q.text} />{l.showMarks && <span className="small-note"> [{q.marks}]</span>}{l.showClo && q.clo && <span className="small-note"> {q.clo}</span>}
            {(q.options || []).map((o, k) => <div key={k} style={{ marginLeft: 18 }}>({String.fromCharCode(97 + k)}) <MathText text={o} /></div>)}
            {(q.parts || []).map((p) => <div key={p.label} style={{ marginLeft: 18 }}>{p.label.match(/^\d/) ? p.label : `(${p.label})`} <MathText text={p.text} />{l.showMarks && <span className="small-note"> [{p.marks}]</span>}</div>)}</div>)}
        </div>))}
      <p className="small-note">{l.footer}</p>
    </div>
  </>);
}
