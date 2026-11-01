import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { chainFor, resolved } from "../../../lib/scopedSettings";
import { SETTINGS, settingsOverview } from "../../../lib/settingsRegistry";
import ScopedEdit from "./ScopedEdit";

export const dynamic = "force-dynamic";

// "Who decides what" (Adeel prompt §15): every setting of the institute, its value, who sets it, who changed it last and
// where. The Super Admin, Institute Head, Deans and HODs see all of it; Program Leads and OMC members see it read-only,
// and can change only their own level (program / department) of the settings that have one.
const FULL = ["SUPER_USER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
const LIMITED = ["PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"];
export default async function WhoDecidesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const omc = !!(user as { omcHat?: boolean }).omcHat;
  if (!FULL.includes(user.role) && !LIMITED.includes(user.role) && !omc) redirect("/dashboard");
  const chain = await chainFor(user as never);
  const rows = chain.chairmanId ? await settingsOverview(chain.chairmanId) : [];
  const areas = Array.from(new Set(rows.map((r) => r.area)));
  // The levels this person may change, with the value stored at each.
  const levelsFor = async (key: string) => {
    const r = await resolved(chain, key, "");
    const at = (t: string) => r.rows.find((x) => x.scopeType === t)?.value || "";
    const out: { scope: string; label: string; value: string }[] = [];
    if (user.role === "CHAIRMAN") out.push({ scope: "INSTITUTE", label: "Institute", value: at("INSTITUTE" ) });
    if ((user.role === "OMC" || omc || user.role === "CHAIRMAN") && chain.departmentId) out.push({ scope: "DEPARTMENT", label: "My department", value: at("DEPARTMENT") });
    if (user.role === "PROGRAM_COORDINATOR") out.push({ scope: "PROGRAM", label: "My program", value: at("PROGRAM") });
    return out;
  };
  const edits = new Map<string, { scope: string; label: string; value: string }[]>();
  for (const s of SETTINGS) if (s.kind === "scoped") edits.set(s.key, await levelsFor(s.key));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Who decides what</h1>
      <p className="small-note">Every setting in OBEHUB for your institute: its value, who sets it, who changed it last, and where to change it. Where a department default and a program value both exist, both are shown — the program&apos;s value applies to that program.</p>
      {areas.map((a) => (
        <div className="card" key={a} style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>{a}</h3>
          <table className="table" style={{ width: "100%", fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: "left" }}>Setting</th><th style={{ textAlign: "left" }}>Value</th><th style={{ textAlign: "left" }}>Who sets it</th><th style={{ textAlign: "left" }}>Last set by</th><th /></tr></thead>
            <tbody>
              {rows.filter((r) => r.area === a).map((r) => (
                <tr key={r.key} style={{ verticalAlign: "top" }}>
                  <td><b>{r.label}</b>{r.help && <div className="small-note">{r.help}</div>}</td>
                  <td>{r.values.map((v, i) => <div key={i}><span className="small-note">{v.scope}:</span> {v.value}{r.unit && /^\d/.test(v.value) ? ` ${r.unit}` : ""}</div>)}
                    {r.editable && (edits.get(r.key) || []).length > 0 && <ScopedEdit k={r.key} levels={edits.get(r.key)!} unit={r.unit} min={r.min} max={r.max} />}</td>
                  <td>{r.who}</td>
                  <td>{r.values.filter((v) => v.by).map((v, i) => <div key={i} className="small-note">{v.by} · {v.at ? new Date(v.at).toLocaleDateString("en-GB") : ""}</div>)}{!r.values.some((v) => v.by) && <span className="small-note">—</span>}</td>
                  <td>{r.href !== "/settings/who-decides" && <Link href={r.href}>Change →</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}
