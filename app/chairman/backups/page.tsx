import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import BackupRestore from "../../../components/BackupRestore";
import { ActionButton } from "../../../components/fyp/FypClient";
import { listBackups, storageReady, TABLES } from "../../../lib/instituteBackup";
import { itAccess } from "../../../lib/itManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Backups" };

export default async function Backups() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const it = await itAccess(user);
  if (!it) redirect("/home");
  const cid = it.chairmanId;
  const stored = await listBackups(cid);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Backups and restore</h1>{!it.canAct && <div className="card" style={{ borderLeft: "5px solid #1565C0", padding: "8px 12px", fontSize: 13 }}><b>Read-only.</b> {it.manager?.name} is the IT Manager and runs this page.</div>}
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Your institute&apos;s own backup — {TABLES.length} tables ({TABLES.map((t) => t.label.toLowerCase()).join(", ")}). Passwords and two-step secrets are never in a backup. The hosting provider also backs up the whole database daily.</p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Take a backup</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn btn-sm" href="/api/backups?now=1">Download a backup now</a>
          {storageReady() && <ActionButton url="/api/backups" body={{ action: "store" }} label="Store a backup now" className="btn btn-secondary btn-sm" />}
        </div>
        <p className="small-note">{storageReady() ? "A backup is also stored automatically every Sunday; the last 8 are kept." : "Automatic weekly backups need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in Vercel; until then use Download."}</p>
        {stored.length > 0 && <table style={{ fontSize: 12.5 }}><thead><tr><th>Stored backup</th><th>Size</th><th></th></tr></thead><tbody>{stored.map((s) => <tr key={s.name}><td>{s.name}</td><td>{(s.size / 1024 / 1024).toFixed(1)} MB</td><td><a href={`/api/backups?name=${encodeURIComponent(s.name)}`}>Download</a></td></tr>)}</tbody></table>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Restore</h3>
        <p className="small-note">Restore only puts back rows that are missing now (for example deleted by mistake) — it never overwrites or removes what is there. Check first to see table by table what would come back. Restored staff get the password 12345678 and must change it.</p>
        <BackupRestore stored={stored} />
      </div>
    </Shell>
  );
}
