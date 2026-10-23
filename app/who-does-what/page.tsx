import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { MATRIX, POSITIONS } from "../../lib/roleMatrix";

export const metadata = { title: "Who does what" };
const COL: Record<string, [string, string]> = { D: ["#1E7B45", "Does"], A: ["#1565C0", "Approves"], I: ["#B26A00", "Informed"], V: ["#757575", "Views"] };

// The task analysis: for every task, who does it, approves it, is informed, or may only view it.
export default async function WhoDoesWhat({ searchParams }: { searchParams: { p?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const pos = POSITIONS.find((p) => p === searchParams.p) || null;
  const areas = Array.from(new Set(MATRIX.map((r) => r.area)));
  const cell = (r: (typeof MATRIX)[number], p: string) => (r.D.includes(p as never) ? "D" : r.A?.includes(p as never) ? "A" : r.I?.includes(p as never) ? "I" : r.V?.includes(p as never) ? "V" : "");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Who does what</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Every task, and who does it, approves it, is told about it, or may only view it. Menus follow this: each person&apos;s main menu holds what they do or approve; view-only pages sit under &quot;Reports (view only)&quot;. Your institute&apos;s own position titles apply.</p>
      <div className="card small-note" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        Show one position: <a href="/who-does-what">all</a>{POSITIONS.map((p) => <a key={p} href={`/who-does-what?p=${encodeURIComponent(p)}`} style={{ fontWeight: pos === p ? 700 : 400 }}>{p}</a>)}
      </div>
      {areas.map((a) => (
        <div key={a} className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>{a}</h3>
          <table style={{ fontSize: 12.5, width: "100%" }}>
            <thead><tr><th>Task</th>{pos ? <th>{pos}</th> : Object.entries(COL).map(([k, [c, l]]) => <th key={k} style={{ color: c }}>{l}</th>)}</tr></thead>
            <tbody>{MATRIX.filter((r) => r.area === a && (!pos || cell(r, pos))).map((r) => (
              <tr key={r.task}><td>{r.task}</td>
                {pos ? <td style={{ fontWeight: 700, color: COL[cell(r, pos)]?.[0] }}>{COL[cell(r, pos)]?.[1]}</td>
                  : (["D", "A", "I", "V"] as const).map((k) => <td key={k} style={{ color: COL[k][0] }}>{((k === "D" ? r.D : r[k]) || []).join(", ")}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}
