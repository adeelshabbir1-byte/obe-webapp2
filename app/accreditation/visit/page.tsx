import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { govScope, inScope } from "../../../lib/accreditation/governance";
import { vdb, data, parseFinding } from "../../../lib/accreditation/visit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit report and rebuttal" };

// Queue item 23: one menu entry for every accreditation visit — the council's report, our rebuttal on each finding,
// and the council's final decision (kept on each cycle's visit page).
export default async function VisitIndex() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const sc = await govScope(user as never);
  if (!sc) redirect("/home");
  const cycles = (await prisma.accreditationCycle.findMany({ where: { chairmanId: sc.chairmanId }, orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }] })).filter((c) => inScope(sc, c));
  const items = (await vdb.visitItem?.findMany({ where: { cycleId: { in: cycles.map((c) => c.id).concat("none") }, kind: { in: ["FINDING", "REPORT"] } } }).catch(() => [])) as { cycleId: string; kind: string; dataJson: string; status: string }[];
  const d = (s?: string) => (s ? s.slice(0, 10) : "—");
  return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Visit report and rebuttal</h1>
    <p className="small-note" style={{ marginTop: 0 }}>For each visit: when the council&apos;s report came, the findings, our position on each (accept, partly accept or rebut, with evidence), when the rebuttal went, and the council&apos;s final decision. Letters and files exchanged with the council are kept under <Link href="/accreditation/letters">Letters with NCEAC / HEC</Link>.</p>
    {!cycles.length ? <div className="card">No accreditation cycle yet — start one under <Link href="/accreditation">Accreditation</Link>.</div> :
      <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Program</th><th>Council</th><th>Visit</th><th>Report received</th><th>Findings</th><th>Rebutted</th><th>Rebuttal sent</th><th>Decision received</th><th>Decided</th><th></th></tr></thead>
        <tbody>{cycles.map((c) => { const mine = items.filter((i) => i.cycleId === c.id); const rep = data(mine.find((i) => i.kind === "REPORT") || { dataJson: "{}" }); const f = mine.filter((i) => i.kind === "FINDING").map(parseFinding);
          const reb = f.filter((x) => x.position === "REBUT" || x.position === "PARTIAL");
          return <tr key={c.id}><td>{c.program}</td><td>{c.body}</td><td>{c.visitDate ? c.visitDate.toISOString().slice(0, 10) : "—"}</td><td>{d(rep.reportReceived)}</td><td>{f.length}</td><td>{reb.length}</td><td>{d(rep.rebuttalSent)}</td><td>{d(rep.decisionReceived)}</td><td>{reb.filter((x) => x.decision && x.decision !== "PENDING").length} of {reb.length}</td><td><Link href={`/accreditation/visit/${c.id}`}>Open →</Link></td></tr>; })}</tbody></table></div>}
  </Shell>;
}
