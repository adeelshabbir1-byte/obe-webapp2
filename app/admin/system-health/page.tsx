import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { checkDatabase, fixScript, settingsCheck, type Issue } from "../../../lib/systemHealth";
import { FixScript, CheckAgain } from "../../../components/SystemHealthControls";

export const dynamic = "force-dynamic";

const KIND: Record<Issue["kind"], string> = {
  MISSING_TABLE: "Missing table", MISSING_COLUMN: "Missing column", MISSING_ENUM: "Missing type", MISSING_ENUM_VALUE: "Missing choice",
  MISSING_UNIQUE: "Missing unique rule", NOT_NULL: "Too strict (NOT NULL)", TYPE: "Different type",
};

export default async function SystemHealthPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");

  let result: Awaited<ReturnType<typeof checkDatabase>> | null = null, error = "";
  try { result = await checkDatabase(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const issues = result?.issues || [];
  const breaks = issues.filter((i) => i.severity === "breaks");
  const risks = issues.filter((i) => i.severity === "risk");
  const info = issues.filter((i) => i.severity === "info" || (i.severity === "risk" && !i.sql));
  const fixable = issues.filter((i) => i.sql);
  const sql = fixScript(issues);
  const settings = settingsCheck();
  const tables = Array.from(new Set(breaks.map((i) => i.table)));

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>System Health</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Checks the live database against what this version of the app expects — every table, column, choice list and unique rule — and
        writes one script that adds whatever is missing. Run it in Supabase → SQL Editor, then press “Check again”. The script only adds;
        it never drops or changes existing data, and it is safe to run more than once.
      </p>
      {error && <div className="err">Could not read the database structure: {error}</div>}

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
          {[
            { l: "Will break pages", v: breaks.length, c: breaks.length ? "#B42318" : "#1F5E36" },
            { l: "Risks", v: risks.filter((i) => i.sql).length, c: risks.some((i) => i.sql) ? "#95650F" : "#1F5E36" },
            { l: "Tables checked", v: result.checkedTables, c: "var(--text)" },
            { l: "Columns checked", v: result.checkedColumns, c: "var(--text)" },
          ].map((s) => <div key={s.l} className="card" style={{ margin: 0, padding: "10px 14px" }}><div style={{ fontSize: 12, color: "var(--slate)" }}>{s.l}</div><div style={{ fontSize: 24, fontWeight: 700, color: s.c }}>{s.v}</div></div>)}
        </div>
      )}

      {result && issues.length === 0 && (
        <div className="card" style={{ background: "#E8F3EC", borderColor: "#BFE0CB" }}>
          <b style={{ color: "#1F5E36" }}>All good.</b> The database matches the app: {result.checkedTables} tables, {result.checkedColumns} columns and {result.checkedEnums} choice lists checked in {result.ms} ms. <CheckAgain />
        </div>
      )}

      {fixable.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fix script ({fixable.length} change{fixable.length > 1 ? "s" : ""})</h3>
          {tables.length > 0 && <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Affects: {tables.join(", ")}.</p>}
          <FixScript sql={sql} />
        </div>
      )}

      {issues.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>What is different ({issues.length})</h3>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Effect</th><th>Kind</th><th>Where</th><th>Detail</th><th>Fixed by the script</th></tr></thead>
            <tbody>
              {[...breaks, ...risks.filter((i) => i.sql), ...info].map((i, k) => (
                <tr key={k}>
                  <td><span className={`badge ${i.severity === "breaks" ? "badge-no" : i.sql ? "badge-warn" : "badge-neutral"}`}>{i.severity === "breaks" ? "breaks pages" : i.sql ? "risk" : "check by hand"}</span></td>
                  <td>{KIND[i.kind]}</td>
                  <td><code>{i.table}{i.column ? `.${i.column}` : ""}</code></td>
                  <td>{i.detail}</td>
                  <td>{i.sql ? "yes" : "no — tell the developer"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Vercel settings</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Only whether each one is set — values are never shown. Change them in Vercel → Project → Settings → Environment Variables, then redeploy.</p>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th>Setting</th><th>Status</th><th>What it does</th></tr></thead>
          <tbody>{settings.map((s) => (
            <tr key={s.key}>
              <td><code>{s.key}</code></td>
              <td><span className={`badge ${s.set ? "badge-ok" : s.need === "required" ? "badge-no" : "badge-neutral"}`}>{s.set ? "set" : s.need === "required" ? "missing" : "not set"}</span></td>
              <td>{s.what}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Shell>
  );
}
