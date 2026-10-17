import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { MIGRATIONS } from "../../../lib/migrationProbes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Database updates" };
const REPO = "https://github.com/adeelshabbir1-byte/obe-webapp2/blob/main/prisma/";

// Which database update files (prisma/migration_*.sql) have been run in Supabase: each is checked by a table or column it creates.
export default async function MigrationsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["SUPER_USER", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const cols = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const tables = new Set(rows.map((r) => r.table_name));
  const list = MIGRATIONS.map((m) => ({ ...m, ok: m.c ? cols.has(`${m.t}.${m.c}`) : tables.has(m.t) })).sort((a, b) => Number(a.ok) - Number(b.ok) || a.f.localeCompare(b.f));
  const missing = list.filter((m) => !m.ok);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Database updates</h1>
      <p className="small-note">Every new feature ships with a SQL file in the <code>prisma</code> folder. This page checks the live database for each one. To run a missing one: open it on GitHub, copy all the text, paste it into Supabase → SQL Editor, and press Run. Every file is safe to run more than once, so when unsure, run it.</p>
      <div className="card" style={{ borderLeft: `4px solid ${missing.length ? "#B3261E" : "#1F5E36"}` }}><b>{missing.length ? `${missing.length} of ${list.length} updates not run yet` : `All ${list.length} updates are in place`}</b></div>
      <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Status</th><th>File</th><th>What it adds</th><th>Checked by</th></tr></thead>
        <tbody>{list.map((m) => <tr key={m.f}><td style={{ color: m.ok ? "#1F5E36" : "#B3261E", fontWeight: 700, whiteSpace: "nowrap" }}>{m.ok ? "✓ done" : "✗ to run"}</td><td><a href={`${REPO}${m.f}`} target="_blank" rel="noopener noreferrer">{m.f}</a></td><td style={{ fontSize: 12 }}>{m.d.replace(/^Run in Supabase SQL Editor\.\s*/i, "")}</td><td style={{ fontSize: 12 }}>{m.t}{m.c ? `.${m.c}` : ""}</td></tr>)}</tbody></table></div>
    </Shell>
  );
}
