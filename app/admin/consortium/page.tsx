import { redirect } from "next/navigation";
import Sources from "../../../components/regulations/Sources";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import CnicLookup from "../../../components/consortium/CnicLookup";
import { RULES, ruleSets, rulesOn, cdb, CONSORTIUM_HINT, type Member } from "../../../lib/consortium";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium" };

const STATUS: Record<string, [string, string]> = { APPLIED: ["Applied", "#B26A00"], ACTIVE: ["Member", "#2E7D32"], SUSPENDED: ["Suspended", "#C62828"], DECLINED: ["Declined", "#6B7177"] };

// Super Admin: the consortium's rules book (HEC minimums, by version), admitting universities, and identity look-up.
export default async function ConsortiumAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER") redirect("/consortium");
  const shell = (x: React.ReactNode) => <Shell roleLabel="Super User" userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const sets = await ruleSets().catch(() => null);
  if (!sets) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  const now = await rulesOn();
  const members = (await cdb.consortiumMember.findMany({ orderBy: { appliedAt: "desc" } })) as Member[];
  const heads = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.chairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const nm = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || id;
  const [people, sponsored] = await Promise.all([cdb.consortiumPerson.count() as Promise<number>, cdb.consortiumAffiliation.count({ where: { kind: "SPONSORED", status: "ACTIVE" } }) as Promise<number>]);
  const groups = Array.from(new Set(RULES.map((r) => r.group)));
  const fmt = (v: number | boolean, unit?: string) => (typeof v === "boolean" ? (v ? "Yes" : "No") : `${v}${unit ? ` ${unit}` : ""}`);
  return shell(
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Consortium</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Universities on OBEHUB offering joint degrees, visiting and ODL courses, and visiting-faculty posts to each other. You keep the HEC minimums here; a university may be stricter, never weaker. A new version applies from its date — programmes approved earlier keep the version they were approved under.</p>
      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
        <span><b>{members.filter((m) => m.status === "ACTIVE").length}</b> member universities</span>
        <span><b style={{ color: "#B26A00" }}>{members.filter((m) => m.status === "APPLIED").length}</b> applications waiting</span>
        <span><b>{people}</b> people registered by CNIC</span><span><b>{sponsored}</b> active sponsored (industry) accounts</span>
        <span>Rules in force: <b>{now.label}</b>{now.version ? ` (v${now.version})` : ""}</span>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Universities</h3>
        {!members.length ? <p className="small-note">No university has applied yet. Institute Heads apply from their Consortium page.</p> :
          <table style={{ fontSize: 13 }}><thead><tr><th>University</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>{members.map((m) => { const [l, c] = STATUS[m.status] || [m.status, "#555"]; return (
            <tr key={m.chairmanId}><td><b>{nm(m.chairmanId)}</b><div className="small-note">{m.city || ""}{m.country !== "PK" ? ` · ${m.country}` : ""}{m.website ? ` · ${m.website}` : ""}</div></td>
              <td style={{ color: c, fontWeight: 700 }}>{l}<div className="small-note" style={{ fontWeight: 400 }}>{m.hecRecognized ? "HEC-recognised (declared)" : "not declared HEC-recognised"}</div></td>
              <td className="small-note">{m.contactName || ""}{m.contactEmail ? ` · ${m.contactEmail}` : ""}{m.note ? <div>{m.note}</div> : null}{m.decisionNote ? <div>Decision: {m.decisionNote}</div> : null}</td>
              <td style={{ whiteSpace: "nowrap" }}><Link href={`/consortium?as=${m.chairmanId}`} className="btn btn-secondary btn-sm">Preview</Link>{" "}{m.status !== "ACTIVE" && <ActionButton showMessage url="/api/consortium" body={{ action: "member", chairmanId: m.chairmanId, status: "ACTIVE" }} label="Admit" confirmText={`Admit ${nm(m.chairmanId)} to the consortium? Check it is on HEC's list of recognised universities.`} />}{" "}
                {m.status === "ACTIVE" && <ActionButton showMessage url="/api/consortium" body={{ action: "member", chairmanId: m.chairmanId, status: "SUSPENDED" }} label="Suspend" className="btn btn-secondary btn-sm" askNote="Why is this university suspended? (shown to it)" noteRequired />}{" "}
                {m.status === "APPLIED" && <ActionButton showMessage url="/api/consortium" body={{ action: "member", chairmanId: m.chairmanId, status: "DECLINED" }} label="Decline" className="btn btn-secondary btn-sm" askNote="Why is the application declined? (shown to the university)" noteRequired />}</td></tr>); })}</tbody></table>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Rules book — in force: {now.label}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
          {groups.map((g) => <div key={g} style={{ border: "1px solid var(--line, #E1E5EA)", borderRadius: 10, padding: "8px 12px" }}>
            <b style={{ fontSize: 13 }}>{g}</b>
            <table style={{ fontSize: 12.5, marginTop: 4 }}><tbody>{RULES.filter((r) => r.group === g).map((r) => <tr key={r.key}><td>{r.label}<div className="small-note" style={{ color: r.source.startsWith("Platform") ? "#B26A00" : undefined }}>{r.source} <Sources targets={[`rule:${r.key}`]} warn compact /></div></td><td style={{ fontWeight: 700, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(now.rules[r.key], r.unit)}</td></tr>)}</tbody></table>
          </div>)}
        </div>
        <p className="small-note">Values marked “Platform default — confirm” are not taken from an HEC document yet; set them once you have the policy text.</p>
        <ActionForm showMessage url="/api/consortium" fixed={{ action: "rules" }} submit="Save as a new version" collapsed openLabel="Change the rules (new version)…"
          initial={{ ...now.rules, label: `Rules ${new Date().getFullYear()}`, effectiveFrom: new Date().toISOString().slice(0, 10) }}
          fields={[{ name: "label", label: "Version name", width: 220 }, { name: "effectiveFrom", label: "Applies from", type: "date" }, { name: "note", label: "Why (e.g. HEC notification no.)", width: 320 },
            ...RULES.map((r) => ({ name: r.key, label: `${r.label}${r.unit ? ` (${r.unit})` : ""}`, type: r.type === "bool" ? ("checkbox" as const) : ("number" as const), width: 120 }))]} />
        {sets.length > 0 && <details style={{ marginTop: 8 }}><summary className="small-note">History ({sets.length} version{sets.length > 1 ? "s" : ""})</summary>
          <table style={{ fontSize: 12.5 }}><tbody>{sets.map((s) => <tr key={s.id}><td>v{s.version} {s.label}</td><td>from {s.effectiveFrom.toISOString().slice(0, 10)}</td><td className="small-note">{s.note || ""}</td><td className="small-note">saved {s.createdAt.toISOString().slice(0, 10)}</td></tr>)}</tbody></table></details>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Find a person by CNIC</h3>
        <p className="small-note" style={{ marginTop: 0 }}>One person, one identity: every account they hold at any institute, and who vouches for each. CNICs are shown only here.</p>
        <CnicLookup />
      </div>
      <p className="small-note"><Link href="/consortium?as=">What an Institute Head sees →</Link></p>
    </>
  );
}
