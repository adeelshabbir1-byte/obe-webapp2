import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { titlesFor, type TitleKey } from "../../lib/titles";
import { PM_ROLES, PHASES, ROWS, GROUP_COLOR, KIND_LABEL, KIND_STYLE, type RoleKey } from "../../lib/processMap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Process map" };

const MY: Record<string, RoleKey> = { CHAIRMAN: "IH", DEAN: "DEAN", HEAD_OF_DEPARTMENT: "HOD", PROGRAM_COORDINATOR: "PL", DEPARTMENT_COORDINATOR: "DC", COURSE_ASSIGNER: "CA", SUBJECT_EXPERT: "SE", OMC: "OMC", INSTRUCTOR: "INS", LAB_ENGINEER: "LAB", FINANCE_OFFICER: "FIN", STUDENT_AFFAIRS: "SA", LIBRARIAN: "LIB", FACILITIES_MANAGER: "LIB", LAB_MANAGER: "LIB" };

export default async function ProcessMap({ searchParams }: { searchParams: { role?: string; phase?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const t = await titlesFor(await chairmanIdFor(user).catch(() => null));
  const name = (k: string, d: string, tk: string) => (tk && t[tk as TitleKey]?.title) || d;
  const roleF = PM_ROLES.find((r) => r[0] === searchParams.role)?.[0] || null;
  const phaseF = searchParams.phase !== undefined && searchParams.phase !== "" ? Number(searchParams.phase) : null;
  const cols = roleF ? PM_ROLES.filter((r) => r[0] === roleF) : PM_ROLES;
  const rows = ROWS.filter((r) => (phaseF === null || r.phase === phaseF) && (!roleF || r.cells[roleF]));
  const mine = MY[user.role];
  const th = { position: "sticky" as const, top: 0, background: "#0D2A4A", color: "#fff", padding: "6px 6px", fontSize: 11.5, zIndex: 2, minWidth: 110, textAlign: "left" as const };
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Process map — who does what, and when</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Every operation in OBEHUB in the order it happens. Rows with the same colour run <b>at the same time</b>; a white row waits for the row above (↓). In each cell: <b style={{ color: KIND_STYLE.D.color }}>does it</b> · <b style={{ color: KIND_STYLE.R.color }}>requests / submits</b> · <b style={{ color: KIND_STYLE.A.color }}>approves / decides</b> · <span style={{ color: KIND_STYLE.I.color }}>is told</span> · <span style={{ color: KIND_STYLE.V.color }}>may look</span>. Click a sub-task to open its page.</p>
      <form className="card no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select name="role" defaultValue={roleF || ""}><option value="">All roles</option>{PM_ROLES.map(([k, d, tk]) => <option key={k} value={k}>{name(k, d, tk)}</option>)}</select>
        <select name="phase" defaultValue={phaseF ?? ""}><option value="">All phases</option>{PHASES.map(([n, l]) => <option key={n} value={n}>{n}. {l}</option>)}</select>
        <button className="btn btn-sm">Show</button>
        {mine && <Link className="btn btn-secondary btn-sm" href={`/process-map?role=${mine}`}>Only my role</Link>}
        <a className="btn btn-secondary btn-sm" href={`/api/process-map${roleF ? `?role=${roleF}` : ""}`}>Download (Excel)</a>
        <span className="small-note">{rows.length} sub-tasks</span>
      </form>
      <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "75vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead><tr>
            <th style={{ ...th, left: 0, zIndex: 3, minWidth: 120 }}>Task</th>
            <th style={{ ...th, left: 120, zIndex: 3, minWidth: 230 }}>Sub-task</th>
            <th style={{ ...th, minWidth: 100 }}>When</th>
            {cols.map(([k, d, tk]) => <th key={k} style={{ ...th, background: k === mine ? "#7A2E3B" : th.background }}>{name(k, d, tk)}</th>)}
          </tr></thead>
          <tbody>{PHASES.filter(([n]) => rows.some((r) => r.phase === n)).flatMap(([n, label, when]) => [
            <tr key={`p${n}`}><td colSpan={3 + cols.length} style={{ background: "#F3E5E8", fontWeight: 800, padding: "6px 8px", position: "sticky", left: 0 }}>{n}. {label} <span className="small-note" style={{ fontWeight: 400 }}>— {when}</span></td></tr>,
            ...rows.filter((r) => r.phase === n).map((r, i, xs) => {
              const bg = r.group ? GROUP_COLOR[r.group] : "#fff";
              const waits = !r.group && i > 0;
              const newGroup = r.group && (i === 0 || xs[i - 1].group !== r.group);
              const cell = { padding: "5px 6px", borderBottom: "1px solid #E6E1D6", background: bg, verticalAlign: "top" as const };
              return (
                <tr key={`${n}-${i}`}>
                  <td style={{ ...cell, position: "sticky", left: 0, zIndex: 1, fontWeight: 700, minWidth: 120 }}>{waits ? "↓ " : ""}{r.task}{newGroup ? <div style={{ fontSize: 10, color: "#2E7D32", fontWeight: 700 }}>parallel group {r.group}</div> : null}</td>
                  <td style={{ ...cell, position: "sticky", left: 120, zIndex: 1, minWidth: 230 }}>{r.href ? <Link href={r.href}>{r.sub}</Link> : r.sub}</td>
                  <td style={cell}>{r.when}</td>
                  {cols.map(([k]) => { const c = r.cells[k]; return <td key={k} style={{ ...cell, color: c ? KIND_STYLE[c[0]].color : undefined, fontWeight: c ? KIND_STYLE[c[0]].weight : 400, outline: k === mine && c ? "2px solid #7A2E3B" : undefined, outlineOffset: -2 }} title={c ? KIND_LABEL[c[0]] : ""}>{c ? c[1] : ""}</td>; })}
                </tr>
              );
            }),
          ])}</tbody>
        </table>
      </div>
      <p className="small-note">Your own column is highlighted. Position names follow your institute&apos;s titles. See also <Link href="/who-does-what">Who Does What</Link> and <Link href="/guide">Getting Started</Link>.</p>
    </Shell>
  );
}
