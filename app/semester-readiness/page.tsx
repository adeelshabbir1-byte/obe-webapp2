import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { readinessBoard, BOARD_ROLES } from "../../lib/semesterReadiness";
import { roleLabel } from "../../lib/reportScope";
import { COLUMNS, type Cell } from "../../lib/semesterReadinessCore";

export const dynamic = "force-dynamic";
const COLOR = { green: ["#E3F2E6", "#1B6B3A"], amber: ["#FBF3E4", "#7A520C"], red: ["#FBE9E7", "#B3261E"] } as const;

function C({ c }: { c: Cell }) {
  const [bg, fg] = COLOR[c.light];
  const body = <span style={{ fontWeight: 600 }}>{c.light === "green" ? "✓ " : c.light === "red" ? "✗ " : "! "}{c.text}</span>;
  return (
    <td style={{ background: bg, color: fg, fontSize: 12.5 }} data-light={c.light} title={c.missing?.length ? `Missing: ${c.missing.join(", ")}` : undefined}>
      {c.href && c.light !== "green" ? <Link href={c.href} style={{ color: fg }}>{body}</Link> : body}
      {c.missing?.length && c.light !== "green" ? <div style={{ fontSize: 11, opacity: 0.85 }}>{c.missing.slice(0, 4).join(", ")}{c.missing.length > 4 ? " …" : ""}</div> : null}
    </td>
  );
}

// Semester readiness: for the HOD and Dean (their department / faculty), the Program Lead (his programs) and the
// Department Coordinator (his department).
export default async function SemesterReadinessPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!BOARD_ROLES.includes(user.role)) redirect("/dashboard");
  const { programs, line } = await readinessBoard(user);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Semester readiness</h1>
      <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }} data-top-line>{line}</p>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <a className="btn btn-brass btn-sm" href="/api/semester-readiness?format=xlsx">Excel</a>
        <a className="btn btn-brass btn-sm" href="/api/semester-readiness?format=pdf">PDF</a>
      </div>
      {programs.length === 0 ? <div className="card">No programs to show.</div> : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 900 }}>
            <thead><tr><th>Program / batch</th>{COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}<th>Starts</th></tr></thead>
            {programs.map((p) => (
              <tbody key={p.leadId} data-program={p.program}>
                <tr style={{ borderTop: "2px solid #DDD" }}>
                  <td><b>{p.program}</b> {p.ready ? <span style={{ color: "#1B6B3A", fontSize: 12 }}>· ready</span> : null}<div className="small-note">{p.department} · {p.term}</div></td>
                  {COLUMNS.map((c) => <C key={c.key} c={p.cells[c.key]} />)}
                  <td style={{ fontSize: 12.5 }}>{p.start ? p.start.toISOString().slice(0, 10) : <span className="small-note">not set</span>}</td>
                </tr>
                {p.batches.map((b) => (
                  <tr key={b.batchId} data-batch={b.label}>
                    <td style={{ paddingLeft: 22, fontSize: 12.5 }}>{b.label}</td>
                    {COLUMNS.map((c) => <C key={c.key} c={b.cells[c.key]} />)}
                    <td />
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="small-note">Green: done · amber: partly · red: not started. Click a red or amber cell to open what is missing.</p>
    </Shell>
  );
}
