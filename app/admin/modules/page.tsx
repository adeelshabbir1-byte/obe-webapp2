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
  const rows = ((await mdb.instituteLicense.findMany({}).catch(() => mdb.instituteLicense.findMany({ select: { chairmanId: true, lockedJson: true, packageKey: true, note: true, validUntil: true, updatedAt: true } }).catch(() => null))) as { chairmanId: string; lockedJson: string; programsJson?: string; packageKey: string | null; note: string | null; validUntil: Date | null; updatedAt: Date }[] | null);
  // Programs each institute already runs (from its batches and department programs), offered as suggestions.
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: { in: heads.map((h) => h.id) } }, select: { id: true, managedById: true } });
  const batchProgs = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id) } }, select: { coordinatorId: true, degreeProgram: true }, distinct: ["coordinatorId", "degreeProgram"] });
  const deptProgs = await prisma.departmentProgram.findMany({ where: { chairmanId: { in: heads.map((h) => h.id) } }, select: { chairmanId: true, degreeProgram: true } }).catch(() => [] as { chairmanId: string; degreeProgram: string }[]);
  const headOf = new Map(leads.map((l) => [l.id, l.managedById || ""]));
  const existing = new Map<string, Set<string>>();
  for (const b of batchProgs) { const h = headOf.get(b.coordinatorId); if (h) existing.set(h, (existing.get(h) || new Set()).add(b.degreeProgram)); }
  for (const d of deptProgs) existing.set(d.chairmanId, (existing.get(d.chairmanId) || new Set()).add(d.degreeProgram));
  const of = new Map((rows || []).map((r) => [r.chairmanId, r]));
  const d = (x: Date | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : null);
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute Modules</h1>
      <p className="small-note" style={{ marginBottom: 12 }}>Switch each module on or off for each institute, to match what it has bought. Core OBE (programs, courses, CLOs and GAs, lecture plans, marks, results, attainment, transcripts, people, settings) is always on. A module switched off hides its menu links, shows a &quot;not in your subscription&quot; notice on its pages and refuses its API calls; its data is kept, so switching it back on restores everything. Institutes never set have everything on. Licensed programs: list the degree programs the institute has bought (for example only BBA); it then cannot add any other program or a batch of one, but can add as many batches of a licensed program as it likes. Leave the list empty for no program limit.</p>
      {rows === null && <div className="err">Run prisma/migration_modules.sql in Supabase first.</div>}
      <ModuleMatrix modules={MODULES.map((m) => ({ key: m.key, label: m.label, group: m.group, about: m.about }))} packages={PACKAGES.map((p) => ({ key: p.key, label: p.label, modules: p.modules }))}
        institutes={heads.map((h) => { const r = of.get(h.id); let locked: string[] = []; try { locked = r ? JSON.parse(r.lockedJson) : []; } catch { locked = []; } let programs: string[] = []; try { programs = r?.programsJson ? JSON.parse(r.programsJson) : []; } catch { programs = []; } return { id: h.id, name: h.instituteName || h.name, email: h.email, programs, existing: Array.from(existing.get(h.id) || []).sort(), locked, packageKey: r?.packageKey || null, note: r?.note || null, validUntil: d(r?.validUntil), updatedAt: d(r?.updatedAt) }; })} />
    </Shell>
  );
}
