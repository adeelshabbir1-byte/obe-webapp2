import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { links, national } from "../../../lib/hecView";
import { HecLinkForm, HecRevoke } from "../../../components/HecForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "HEC national view" };

export default async function AdminHecView() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER") redirect("/home");
  const [ls, n] = await Promise.all([links(), national().catch(() => ({ sharing: 0, totalInstitutes: 0 }))]);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>HEC national view</h1>
      <p className="small-note">A read-only page for HEC with the totals of institutes that chose to share ({n.sharing} of {n.totalInstitutes} now), and national curriculum adoption. Make a private link for an HEC officer; it expires and can be revoked.</p>
      <HecLinkForm />
      <div className="card"><table style={{ fontSize: 13 }}><thead><tr><th>For</th><th>Made</th><th>Valid until</th><th>Last opened</th><th /></tr></thead>
        <tbody>{ls.map((l) => <tr key={l.id}><td>{l.label}</td><td>{new Date(l.createdAt).toISOString().slice(0, 10)}</td><td>{l.revokedAt ? "revoked" : new Date(l.expiresAt).toISOString().slice(0, 10)}</td><td>{l.lastSeen ? new Date(l.lastSeen).toISOString().slice(0, 10) : "—"}</td><td>{!l.revokedAt && <HecRevoke id={l.id} />}</td></tr>)}</tbody></table></div>
    </Shell>
  );
}
