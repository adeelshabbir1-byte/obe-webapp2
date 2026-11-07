import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { adminNavFor, adminCan } from "../../../lib/platformTeam";
import * as F from "../../../lib/facultyStatus";
import { BODIES, versionFor } from "../../../lib/facultyRulesCore";
import { PostButton, VersionForm } from "../../../components/FacultyStatusForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accreditation requirements" };

// Queue item 23: the Super Admin team keeps each council's faculty requirements as versions; each applies from the
// term it names, so a council's new manual takes effect from that semester without changing earlier terms.
export default async function AccreditationRules() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user as never, "REGULATIONS"))) redirect("/home");
  const vs = await F.versions();
  const now = new Date(); const term = now.getUTCMonth() >= 7 ? "Fall" : "Spring";
  return <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : "Platform team"} userName={user.name} navLinks={await adminNavFor(user)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation requirements</h1>
    <p className="small-note" style={{ marginTop: 0 }}>Figures only from the council&apos;s official manual or notification; write the source in the note. Until a version is added, the values of the NCEAC Accreditation Manual 2023 (§3.2.5) apply.</p>
    {vs === null ? <div className="card err">{F.FST_HINT}</div> : Object.entries(BODIES).map(([body, fields]) => {
      const mine = vs.filter((v) => v.body === body);
      const cur = versionFor(body, mine.map((v) => ({ id: v.id, body, label: v.label, fromTerm: v.fromTerm, fromYear: v.fromYear, rules: v.rules })), term, now.getUTCFullYear());
      return <div key={body} className="card"><h3 style={{ marginTop: 0 }}>{body}</h3>
        <p className="small-note">In force for {term} {now.getUTCFullYear()}: <b>{cur.label}</b></p>
        {mine.length > 0 && <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Version</th><th>Applies from</th><th>Changes</th><th>Note</th><th></th></tr></thead>
          <tbody>{mine.map((v) => <tr key={v.id}><td>{v.label}</td><td>{v.fromTerm} {v.fromYear}</td><td>{fields.filter((f) => v.rules[f.key] !== undefined && v.rules[f.key] !== f.def).map((f) => `${f.label.split(",")[0]}: ${v.rules[f.key]}`).join("; ") || "same as the manual"}</td><td>{v.note || ""}</td><td><PostButton body={{ action: "withdraw", id: v.id }} label="withdraw" confirm="Withdraw this version?" /></td></tr>)}</tbody></table>}
        <details style={{ marginTop: 8 }}><summary>Add a version</summary><VersionForm body={body} fields={fields} current={cur.rules} /></details></div>;
    })}
  </Shell>;
}
