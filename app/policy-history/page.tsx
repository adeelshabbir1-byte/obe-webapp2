import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { REVIEW_ROLES } from "../../lib/reviewScope";
import { whoIs, programsOf, day } from "../../lib/registers";
import { POL_HINT, KINDS, docsWithVersions, trailGaps, trailText, canEditPolicies } from "../../lib/policyHistory";
import { ActionForm } from "../../components/fyp/FypClient";
import UploadForm from "../../components/UploadForm";

export const dynamic = "force-dynamic";

// Policy version history: every policy, manual and curriculum with the approval trail of each version.
export default async function PolicyHistoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !(REVIEW_ROLES.includes(user.role) || w.qec)) redirect("/dashboard");
  const docs = await docsWithVersions(w.chairmanId);
  const edit = canEditPolicies(w);
  const programs = await programsOf(w.chairmanId);
  const gaps = (docs || []).filter((d) => !d.current || trailGaps(d.current).length).length;
  const versionFields = [{ name: "version", label: "Version", width: 90, required: true }, { name: "effectiveFrom", label: "Effective from", type: "date" as const }, { name: "bosMeeting", label: "BoS meeting", placeholder: "14th BoS", width: 110 }, { name: "bosMinute", label: "BoS minute no.", width: 90 }, { name: "bosDate", label: "BoS date", type: "date" as const }, { name: "acMeeting", label: "Academic Council meeting", placeholder: "22nd AC", width: 120 }, { name: "acMinute", label: "AC minute no.", width: 90 }, { name: "acDate", label: "AC date", type: "date" as const }, { name: "link", label: "…or a link to the document", width: 220 }, { name: "summary", label: "What changed", type: "textarea" as const }];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Policy Version History</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>Each policy, manual and curriculum, every approved version with its Board of Studies and Academic Council meeting and minute numbers, approval and effective dates. The trail is printed into the SAR. {gaps ? <b style={{ color: "#B3261E" }}>{gaps} document(s) have gaps in their trail.</b> : ""}</p>
      <HowCalculated shows="The current version is the latest one whose effective date has come.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}><li>A trail has gaps when the Board of Studies or Academic Council approval, the effective date or the approved document itself is missing — the visiting team will ask for them.</li></ul>
      </HowCalculated>
      {docs === null && <div className="err">{POL_HINT}</div>}
      {edit && <div className="card"><ActionForm url="/api/policy-history" fixed={{ action: "doc" }} submit="Add" collapsed openLabel="Add a policy, manual or curriculum" fields={[{ name: "kind", label: "Kind", type: "select", options: Object.entries(KINDS) }, { name: "title", label: "Title", width: 260 }, { name: "program", label: "Program (if it belongs to one)", type: "select", options: programs.map((p) => [p, p] as [string, string]) }]} /></div>}
      {(docs || []).map((d) => (
        <div key={d.id} className="card" style={{ overflowX: "auto", borderLeft: `5px solid ${d.current && !trailGaps(d.current).length ? "#1E6B3A" : "#9A3412"}` }}>
          <h3 style={{ margin: "0 0 2px" }}>{d.title}</h3>
          <p className="small-note" style={{ margin: "0 0 6px" }}>{KINDS[d.kind]}{d.program ? ` · ${d.program}` : ""} · current version: <b>{d.current?.version || "none"}</b>{d.current && trailGaps(d.current).length ? <span style={{ color: "#B3261E" }}> — missing {trailGaps(d.current).join(", ")}</span> : ""}</p>
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Version</th><th>Approval trail</th><th>Effective from</th><th>What changed</th><th>Document</th></tr></thead>
            <tbody>{d.versions.map((v) => <tr key={v.id} style={{ fontWeight: v.id === d.current?.id ? 700 : 400 }}><td>{v.version}{v.id === d.current?.id ? " (current)" : ""}</td><td>{trailText(v)}</td><td>{day(v.effectiveFrom)}</td><td style={{ fontWeight: 400, fontSize: 12.5 }}>{v.summary || "—"}</td><td>{v.fileName ? <a className="act" href={`/api/policy-history?file=${v.id}`}>{v.fileName}</a> : v.link ? <a className="act" href={v.link} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>)}
              {!d.versions.length && <tr><td colSpan={5}>No version recorded.</td></tr>}</tbody></table>
          {edit && <UploadForm url="/api/policy-history" fixed={{ docId: d.id }} submit="Save version" collapsed openLabel="Add a version" file={{ name: "file", label: "Approved document (PDF, up to 3 MB)", accept: ".pdf,.doc,.docx" }} fields={versionFields} />}
        </div>
      ))}
      {docs && !docs.length && <div className="card">Nothing recorded yet.</div>}
    </Shell>
  );
}
