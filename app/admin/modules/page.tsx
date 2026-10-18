import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import ModuleMatrix from "../../../components/ModuleMatrix";
import { MODULES, PACKAGES } from "../../../lib/modules";

export const dynamic = "force-dynamic";
const mdb = prisma as unknown as Record<string, any>;

// Super User: which modules each institute has bought. Core OBE is always on.
export default async function ModulesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER") redirect("/dashboard");
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" }, select: { id: true, name: true, email: true, instituteName: true } as never, orderBy: { name: "asc" } }) as unknown as { id: string; name: string; email: string; instituteName?: string | null }[];
  const rows = ((await mdb.instituteLicense.findMany({}).catch(() => null)) as { chairmanId: string; lockedJson: string; packageKey: string | null; note: string | null; validUntil: Date | null; updatedAt: Date }[] | null);
  const of = new Map((rows || []).map((r) => [r.chairmanId, r]));
  const d = (x: Date | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : null);
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute Modules</h1>
      <p className="small-note" style={{ marginBottom: 12 }}>Switch each module on or off for each institute, to match what it has bought. Core OBE (programs, courses, CLOs and PLOs, lecture plans, marks, results, attainment, transcripts, people, settings) is always on. A module switched off hides its menu links, shows a &quot;not in your subscription&quot; notice on its pages and refuses its API calls; its data is kept, so switching it back on restores everything. Institutes never set have everything on.</p>
      {rows === null && <div className="err">Run prisma/migration_modules.sql in Supabase first.</div>}
      <ModuleMatrix modules={MODULES.map((m) => ({ key: m.key, label: m.label, group: m.group, about: m.about }))} packages={PACKAGES.map((p) => ({ key: p.key, label: p.label, modules: p.modules }))}
        institutes={heads.map((h) => { const r = of.get(h.id); let locked: string[] = []; try { locked = r ? JSON.parse(r.lockedJson) : []; } catch { locked = []; } return { id: h.id, name: h.instituteName || h.name, email: h.email, locked, packageKey: r?.packageKey || null, note: r?.note || null, validUntil: d(r?.validUntil), updatedAt: d(r?.updatedAt) }; })} />
    </Shell>
  );
}
