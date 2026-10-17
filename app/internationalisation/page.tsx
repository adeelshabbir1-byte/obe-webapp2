import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import QualityShell from "../../components/QualityShell";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { qdb, QUALITY_HINT, INTL_KINDS, instituteOf } from "../../lib/quality";

export const dynamic = "force-dynamic";
const VIEW = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "STUDENT_AFFAIRS", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];
type R = { id: string; kind: string; title: string; partner: string | null; country: string | null; startDate: Date | null; endDate: Date | null; people: number | null; note: string | null; createdById: string };

// Internationalisation (NBEAC asks for it; HEC IPE and rankings use it): exchanges, foreign students and faculty, MoUs, joint programs.
export default async function IntlPage({ searchParams }: { searchParams: { kind?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!VIEW.includes(user.role)) redirect("/dashboard");
  const cid = await instituteOf(user);
  const intro = "International links in one list: MoUs, student exchanges both ways, foreign students and faculty, joint programs, visits and research collaborations. NBEAC has a criterion on it, and HEC's IPE and rankings ask for the same figures.";
  const all = ((await qdb.intlRecord.findMany({ where: { chairmanId: cid || "none" }, orderBy: { createdAt: "desc" } }).catch(() => null)) as R[] | null);
  if (all === null) return <QualityShell user={user} title="Internationalisation" intro={intro}><div className="err">{QUALITY_HINT}</div></QualityShell>;
  const rows = searchParams.kind ? all.filter((r) => r.kind === searchParams.kind) : all;
  const kn = new Map(INTL_KINDS);
  const edit = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "STUDENT_AFFAIRS", "PROGRAM_COORDINATOR"].includes(user.role);
  const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");
  const countries = new Set(all.map((r) => r.country).filter(Boolean)).size;
  return (
    <QualityShell user={user} title="Internationalisation" intro={intro}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        {[["International MoUs", all.filter((r) => r.kind === "MOU").length], ["Students exchanged (out / in)", `${all.filter((r) => r.kind === "EXCHANGE_OUT").reduce((s, r) => s + (r.people || 1), 0)} / ${all.filter((r) => r.kind === "EXCHANGE_IN").reduce((s, r) => s + (r.people || 1), 0)}`], ["Foreign students", all.filter((r) => r.kind === "FOREIGN_STUDENTS").reduce((s, r) => s + (r.people || 1), 0)], ["Foreign / visiting faculty", all.filter((r) => r.kind === "FOREIGN_FACULTY").reduce((s, r) => s + (r.people || 1), 0)], ["Countries", countries]].map(([l, v]) => <div key={String(l)} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div></div>)}
      </div>
      {edit && <div className="card"><ActionForm url="/api/quality" fixed={{ action: "intlAdd" }} submit="Add" collapsed openLabel="Add a record" fields={[{ name: "kind", label: "Kind", type: "select", options: INTL_KINDS }, { name: "title", label: "Title", width: 260, placeholder: "MoU with University of …" }, { name: "partner", label: "Partner institution", width: 200 }, { name: "country", label: "Country", width: 120 }, { name: "startDate", label: "From", type: "date" }, { name: "endDate", label: "To", type: "date" }, { name: "people", label: "People (if any)", type: "number", width: 80 }, { name: "note", label: "Note", type: "textarea", full: true }]} /></div>}
      <form className="card" style={{ display: "flex", gap: 8 }}><select name="kind" defaultValue={searchParams.kind || ""}><option value="">All kinds</option>{INTL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="small-note">Nothing recorded yet.</p> : (
          <table style={{ fontSize: 13 }}><thead><tr><th>Kind</th><th>Title</th><th>Partner</th><th>Country</th><th>Dates</th><th>People</th><th>Note</th><th /></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{kn.get(r.kind)}</td><td>{r.title}</td><td>{r.partner || "—"}</td><td>{r.country || "—"}</td><td>{d(r.startDate)}{r.endDate ? ` – ${d(r.endDate)}` : ""}</td><td>{r.people ?? ""}</td><td style={{ maxWidth: 240 }}>{r.note}</td>
              <td>{(user.role === "CHAIRMAN" || r.createdById === user.id) && <ActionButton url="/api/quality" body={{ action: "intlDelete", id: r.id }} label="Delete" className="act" confirmText="Delete this record?" />}</td></tr>)}</tbody></table>
        )}
      </div>
    </QualityShell>
  );
}
