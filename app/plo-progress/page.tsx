import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, coordinatorIdsFor, chairmanIdFor } from "../../lib/reportScope";
import DegreeBatchFilter from "../../components/DegreeBatchFilter";
import { FLOW_VIEW_ROLES } from "../../lib/outcomeFlow";
import { ploProgress } from "../../lib/ploProgress";
import { getPassingCriteria } from "../../lib/passingCriteria";

export const dynamic = "force-dynamic";
const COLORS = ["#2F6FB0", "#2E7D5B", "#A63D40", "#9A7B0A", "#6B3F8A", "#0F7C8A", "#7A5C2E", "#C2185B", "#455A64", "#E65100", "#1B5E20", "#4A148C"];

export default async function PloProgressPage({ searchParams }: { searchParams: { batchId?: string; degree?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!FLOW_VIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const leads = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const batch = batches.find((b) => b.id === searchParams.batchId) || null;
  const criteria = await getPassingCriteria(await chairmanIdFor(user));
  const data = batch ? await ploProgress(batch.id, criteria.ploPct || 50) : null;
  const W = 760, H = 260, L = 40, B = 30;
  const x = (i: number, n: number) => L + (n <= 1 ? (W - L - 20) / 2 : (i * (W - L - 20)) / (n - 1));
  const y = (v: number) => 10 + ((100 - v) * (H - B - 10)) / 100;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO Progress by Semester</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>How a batch&apos;s PLO attainment grows term by term (all courses up to that term): the share of students whose average on each PLO reached {criteria.ploPct || 50}%. Use it to see whether CQI actions are working.</p>
      <div className="card no-print"><DegreeBatchFilter batches={batches} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} /></div>
      {batch && data && (data.terms.length === 0 ? <div className="card">No approved results with transcripts for this batch yet.</div> : (
        <div className="card" style={{ overflowX: "auto" }}>
          <svg width={W} height={H} style={{ maxWidth: "100%" }} role="img" aria-label="PLO attainment by term">
            {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - 10} y1={y(v)} y2={y(v)} stroke="#EEE7E8" /><text x={L - 6} y={y(v) + 4} fontSize={10} textAnchor="end" fill="#8A7F82">{v}%</text></g>)}
            {data.terms.map((t, i) => <text key={t} x={x(i, data.terms.length)} y={H - 8} fontSize={10.5} textAnchor="middle" fill="#574C50">{t}</text>)}
            {data.series.map((s, k) => {
              const pts = s.points.map((p, i) => (p.reached === null ? null : [x(i, data.terms.length), y(p.reached)] as const)).filter((p): p is readonly [number, number] => !!p);
              return <g key={s.label}><polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={2} />{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={COLORS[k % COLORS.length]} />)}</g>;
            })}
          </svg>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, margin: "6px 0 12px" }}>{data.series.map((s, k) => <span key={s.label}><span style={{ display: "inline-block", width: 10, height: 10, background: COLORS[k % COLORS.length], borderRadius: 2, marginRight: 4 }} />{s.label}</span>)}</div>
          <table>
            <thead><tr><th>PLO</th>{data.terms.map((t) => <th key={t} style={{ textAlign: "center" }}>{t}</th>)}</tr></thead>
            <tbody>{data.series.map((s) => <tr key={s.label}><td><b>{s.label}</b></td>{s.points.map((p) => <td key={p.term} style={{ textAlign: "center", color: p.reached === null ? "var(--slate)" : p.reached >= 60 ? "#1F5E36" : "#95650F" }}>{p.reached === null ? "—" : <>{p.reached}%<div style={{ fontSize: 10.5, color: "var(--slate)" }}>avg {p.avg}%</div></>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}
