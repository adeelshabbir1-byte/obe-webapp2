import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import EvidenceFileForm from "../../components/EvidenceFileForm";
import RemoveButton from "../../components/RemoveButton";
import { CRITERIA, FILE_ROLES, fileScope } from "../../lib/evidenceFiles";
import { ROLE_TEXT } from "../../lib/institutePeople";

type F = { id: string; leadId: string | null; criterion: number | null; title: string; note: string | null; fileName: string; size: number; uploadedById: string; createdAt: Date };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function EvidenceFilesPage({ searchParams }: { searchParams: { criterion?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!FILE_ROLES.includes(user.role)) redirect("/dashboard");
  const scope = await fileScope(user);
  const crit = searchParams.criterion ? Number(searchParams.criterion) : null;
  const rows = (await prisma.evidenceFile.findMany({
    where: { ...scope.visible("uploadedById"), ...(crit ? { criterion: crit } : {}) } as never,
    select: { id: true, leadId: true, criterion: true, title: true, note: true, fileName: true, size: true, uploadedById: true, createdAt: true },
    orderBy: [{ criterion: "asc" }, { createdAt: "desc" }], take: 500,
  })) as unknown as F[];
  const users = (await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.uploadedById))).concat(["none"]) } }, select: { id: true, name: true } })) as unknown as { id: string; name: string }[];
  const name = new Map(users.map((u) => [u.id, u.name]));
  const lead = new Map(scope.leads.map((l) => [l.id, l.leadProgram || l.name]));
  const total = rows.reduce((n, r) => n + r.size, 0);
  return (
    <Shell roleLabel={ROLE_TEXT[user.role] || "Evidence"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Evidence files</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        The actual documents behind the accreditation report: approval letters, certificates, reports, photographs. Each is filed under an NCEAC criterion and listed in the printed Self-Assessment Report.
      </p>
      <EvidenceFileForm mode="file" criteria={CRITERIA} leads={scope.leads.map((l) => ({ id: l.id, label: l.leadProgram || l.name }))} />
      <form method="get" style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 13 }}>Show <select name="criterion" defaultValue={crit ? String(crit) : ""} style={{ padding: "5px 8px" }}><option value="">All criteria</option>{Object.entries(CRITERIA).map(([n, t]) => <option key={n} value={n}>{n}. {t}</option>)}</select></label>
        <button className="btn" type="submit">Show</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>No files yet.</p> : (
          <>
            <table>
              <thead><tr><th>Criterion</th><th>Title</th><th>Program</th><th>File</th><th>Added</th><th></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.criterion ? `${r.criterion}. ${CRITERIA[r.criterion]}` : "General"}</td>
                  <td><b>{r.title}</b>{r.note && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{r.note}</div>}</td>
                  <td>{r.leadId ? lead.get(r.leadId) || "—" : "Whole institute"}</td>
                  <td><a href={`/api/evidence-files/${r.id}`}>{r.fileName}</a> <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{kb(r.size)}</span></td>
                  <td style={{ fontSize: 12 }}>{day(r.createdAt)}<div style={{ color: "var(--slate)" }}>{name.get(r.uploadedById) || ""}</div></td>
                  <td>{(r.uploadedById === user.id || user.role === "CHAIRMAN") && <RemoveButton url={`/api/evidence-files?id=${r.id}`} confirmText="Remove this file?" />}</td>
                </tr>
              ))}</tbody>
            </table>
            <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>{rows.length} files, {kb(total)} in all.</p>
          </>
        )}
      </div>
    </Shell>
  );
}
