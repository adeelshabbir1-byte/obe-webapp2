import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import DataImportWizard from "../../components/DataImportWizard";
import { ActionButton } from "../../components/fyp/FypClient";
import { KINDS, OTHER_IMPORTERS, idb, IMPORT_HINT } from "../../lib/dataImport";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data Import" };

export default async function DataImport() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user);
  const pl = user.role === "PROGRAM_COORDINATOR";
  const [batches, leads] = await Promise.all([
    prisma.batch.findMany({ where: pl ? { coordinatorId: user.id } : { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] }),
    pl ? Promise.resolve([] as { id: string; name: string }[]) : prisma.user.findMany({ where: { managedById: cid, role: "PROGRAM_COORDINATOR" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const logs = (await idb.importLog.findMany({ where: { chairmanId: cid }, orderBy: { createdAt: "desc" }, take: 30 }).catch(() => null)) as { id: string; kind: string; fileName: string; rows: number; created: number; skipped: number; status: string; byId: string; createdAt: Date }[] | null;
  const names = new Map((await prisma.user.findMany({ where: { id: { in: (logs || []).map((l) => l.byId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Data Import — bring in your earlier records</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Use our template or your own spreadsheet (.xlsx or .csv). Match the columns, check every row in a dry run, then import. Existing rows are skipped, so uploading again is safe, and each import can be undone below.</p>
      <DataImportWizard kinds={KINDS.map((k) => ({ key: k.key, title: k.title, what: k.what, needs: k.needs, fields: k.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })) }))}
        batches={batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`])} leads={leads.map((l) => [l.id, l.name])} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Other imports</h3>
        <table style={{ fontSize: 13 }}><tbody>{OTHER_IMPORTERS.map((o) => <tr key={o.href + o.template}><td>{o.title}</td><td><a href={o.href}>Open</a></td><td><a href={`/api/templates/${o.template}`}>Template</a></td></tr>)}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Import log</h3>
        {!logs ? <p className="small-note">{IMPORT_HINT}</p> : logs.length === 0 ? <p className="small-note">No imports yet.</p> : (
          <table style={{ fontSize: 12.5 }}><thead><tr><th>When</th><th>What</th><th>File</th><th>By</th><th>Rows</th><th>Added</th><th>Skipped</th><th></th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id} style={{ opacity: l.status === "UNDONE" ? 0.55 : 1 }}><td>{new Date(l.createdAt).toLocaleString("en-GB")}</td><td>{KINDS.find((k) => k.key === l.kind)?.title || l.kind}</td><td>{l.fileName}</td><td>{names.get(l.byId) || "—"}</td><td>{l.rows}</td><td>{l.created}</td><td>{l.skipped}</td>
                <td>{l.status === "UNDONE" ? "Undone" : <ActionButton url="/api/data-import" body={{ action: "undo", id: l.id }} label="Undo" className="btn btn-secondary btn-sm" confirmText={`Remove the ${l.created} row(s) this import added?`} />}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
