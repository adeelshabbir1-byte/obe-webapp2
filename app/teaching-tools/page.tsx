import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import TeachingToolsForm from "../../components/TeachingToolsForm";
import { itAccess } from "../../lib/itManager";
import { toolsOf, TOOLS_HINT } from "../../lib/teachingTools";
import { SCOPES, TOOLS, LMS_FEATURES } from "../../lib/teachingToolsCore";
import { canSeal } from "../../lib/secretBox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teaching tools" };

// Queue item 14 B: the institute connects Moodle, Google Classroom + Meet, Microsoft Teams and YouTube once. Courses
// then link to their class (Course → Teaching tools), and OBEHUB pulls the evidence back for the ODL record.
export default async function TeachingToolsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const it = await itAccess(user);
  if (!it) redirect("/home");
  const tools = await toolsOf(it.chairmanId);
  const dot = (s: string) => <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 12, background: s === "OK" ? "#E6F4EA" : s === "FAILING" ? "#FDECEA" : "#EEF0F3", color: s === "OK" ? "#1E6B3A" : s === "FAILING" ? "#B3261E" : "#5B6570" }}>{s === "OK" ? "✓ connected" : s === "FAILING" ? "✗ needs attention" : "○ not connected"}</span>;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Teaching tools</h1>
      <p className="small-note" style={{ marginTop: 0 }}>The tools deliver the teaching; OBEHUB keeps the OBE record and pulls the evidence back — class lists, grades, live-lecture attendance, recordings, forum activity and video lengths — for each course and for the ODL wizard&apos;s weekly record (HEC ODL Part-II 10, 12.5, 21.1.viii). Teachers link each course under <b>Course → Teaching Tools</b>.</p>
      {!it.canAct && <div className="card" style={{ borderLeft: "5px solid #1565C0", padding: "8px 12px", fontSize: 13 }}><b>Read-only.</b> {it.manager?.name} is the IT Manager and runs this page.</div>}
      {!canSeal() && <div className="card" style={{ borderLeft: "5px solid #B3261E", padding: "8px 12px", fontSize: 13 }}>The server has no key to encrypt credentials. Set <code>TOOLS_SECRET_KEY</code> in the hosting settings before connecting a tool.</div>}
      {!tools ? <div className="card" style={{ fontSize: 13 }}>{TOOLS_HINT}</div> : tools.map((t) => {
        const def = TOOLS[t.tool];
        return (
          <section key={t.tool} className="card" style={{ marginTop: 12 }} data-tool={t.tool}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>{def.label}</h2>
              <span>{dot(t.status)}{t.lastCheckAt && <span className="small-note"> · checked {t.lastCheckAt.toISOString().slice(0, 16).replace("T", " ")}</span>}</span>
            </div>
            <p style={{ fontSize: 13, margin: "6px 0" }}>{def.does}</p>
            <details style={{ fontSize: 12.5, margin: "4px 0 8px" }}><summary>How to set it up</summary><p style={{ margin: "4px 0" }}>{def.setup}</p>
              <div className="small-note">{t.tool === "MOODLE" ? "Web-service functions" : t.tool === "MICROSOFT" ? "Graph application permissions" : t.tool === "GOOGLE" ? "Delegated scopes" : "API"}: <code style={{ wordBreak: "break-all" }}>{SCOPES[t.tool].join(", ")}</code></div></details>
            <TeachingToolsForm tool={t.tool} label={def.label} fields={def.fields} plain={t.plain} secretSet={t.secretSet} canAct={it.canAct} checks={t.checks} status={t.status} />
          </section>
        );
      })}
      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>What each tool adds to the LMS features HEC lists (ODL 10.ii)</h2>
        <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Feature</th><th>OBEHUB</th><th>Moodle</th><th>Classroom</th><th>Teams</th></tr></thead>
          <tbody>{LMS_FEATURES.map((f) => <tr key={f.n}><td>{f.n}. {f.name}</td><td>{f.obehub ? <Link href={f.obehub}>yes</Link> : "—"}</td><td>{f.MOODLE}</td><td>{f.GOOGLE}</td><td>{f.MICROSOFT}</td></tr>)}</tbody></table></div>
        <p className="small-note">&quot;partial&quot;: Moodle attendance needs the Attendance plugin; Classroom has no attendance (Meet attendance is read from Meet); YouTube does not say who watched — watch tracking needs videos embedded in the LMS.</p>
      </section>
    </Shell>
  );
}
