import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import AutoSubmitSelect from "../../components/AutoSubmitSelect";
import GaCouncilMatrix from "../../components/GaCouncilMatrix";
import { COUNCIL_KEYS, COUNCIL_SETS, isCouncilKey, type CouncilKey } from "../../lib/councilAttributes";
import { GA_MAP_EDITORS, loadMap, mapBatches } from "../../lib/gaCouncilMap";
import { bodyOfProgram } from "../../lib/accreditation/bodies";

export const dynamic = "force-dynamic";
export const metadata = { title: "GA → Council Attributes" };
const VIEW = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];

// Each batch's own Graduate Attributes mapped to its council's attributes (PEC EGA, NCEAC CGA, NBEAC BGA), with the
// coverage check, and the council's list loadable as the batch's GAs in one click.
export default async function GaCouncilMapPage({ searchParams }: { searchParams: { batchId?: string; body?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!VIEW.includes(user.role)) redirect("/dashboard");
  const batches = await mapBatches(user);
  const batch = batches.find((b) => b.id === searchParams.batchId) || batches[0] || null;
  const chairmanId = await chairmanIdFor(user);
  const bound = batch ? await bodyOfProgram(chairmanId, batch.degreeProgram) : null;
  const body: CouncilKey = isCouncilKey(searchParams.body) ? searchParams.body : bound && isCouncilKey(bound.body) ? (bound.body as CouncilKey) : "PEC";
  const set = COUNCIL_SETS[body];
  const [gas, map] = batch ? await Promise.all([prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, description: true, status: true } }), loadMap(batch.id, body)]) : [[], new Map<string, number[]>()];
  const canEdit = GA_MAP_EDITORS.includes(user.role) && (user.role !== "PROGRAM_COORDINATOR" || batch?.coordinatorId === user.id);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>GA → Council Attributes</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, margin: "0 0 12px", maxWidth: 900 }}>
        Map each of the program&apos;s Graduate Attributes (GA) to the council&apos;s own attributes — <b>EGA</b> for PEC&apos;s 12, <b>CGA</b> for NCEAC&apos;s 10,
        <b> BGA</b> for an NBEAC school&apos;s learning goals — and see at a glance which council attribute no GA covers. A new program can load the council&apos;s
        list as its GAs in one click, with the full statements; the Institute Head then approves them as usual.
      </p>
      {batches.length === 0 ? <div className="card"><p className="small-note" style={{ margin: 0 }}>No batch to show.</p></div> : (
        <>
          <div className="card" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="small-note">Batch</span>
              <AutoSubmitSelect name="batchId" defaultValue={batch!.id} options={batches.map((b) => ({ value: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))} />
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className="small-note">Council</span>
              {COUNCIL_KEYS.map((k) => (
                <Link key={k} href={`/ga-council-map?batchId=${batch!.id}&body=${k}`} className={`btn btn-sm ${k === body ? "btn-brass" : "btn-secondary"}`}>{k} · {COUNCIL_SETS[k].prefix}{bound?.body === k ? " ✓" : ""}</Link>
              ))}
            </span>
          </div>
          <p className="small-note" style={{ margin: "0 0 8px" }}>
            {set.name} — {set.source}.{bound && bound.body !== body ? ` This program is bound to ${bound.body}.` : ""}
          </p>
          <GaCouncilMatrix key={`${batch!.id}-${body}`} batchId={batch!.id} set={set} gas={gas} initial={Object.fromEntries(map)} canEdit={canEdit} />
          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>The {set.attrs.length} {set.prefix}s in full</summary>
            <ol style={{ fontSize: 13, paddingLeft: 20 }}>{set.attrs.map((a) => <li key={a.n} style={{ marginBottom: 6 }}><b>{set.prefix}-{a.n} {a.title}.</b> {a.statement}</li>)}</ol>
          </details>
        </>
      )}
    </Shell>
  );
}
