import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { GLOSSARY, STATUS, TONE } from "../../../lib/glossary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Glossary" };

// Every term OBEHUB uses, in plain English, with links to where it is used; and the meaning of every status badge.
export default async function GlossaryPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const q = (searchParams.q || "").trim().toLowerCase();
  const terms = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term)).filter((t) => !q || `${t.term} ${t.meaning}`.toLowerCase().includes(q));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Glossary</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0 }}>The words used across OBEHUB, explained simply, with the pages where they matter.</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}><Link href="/help" className="btn btn-secondary btn-sm">Help</Link><Link href="/help/permissions" className="btn btn-secondary btn-sm">Who can do what</Link></div>
      </div>
      <form className="card" style={{ display: "flex", gap: 8 }}><input name="q" defaultValue={searchParams.q || ""} placeholder="Find a word, e.g. attainment" style={{ flex: 1 }} aria-label="Find a word" /><button className="btn btn-sm">Find</button></form>
      <div className="card">
        {terms.length === 0 && <p className="small-note">No term matches “{searchParams.q}”.</p>}
        {terms.map((t) => (
          <div key={t.key} id={t.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontSize: 15 }}>{t.term}</b>
            <p style={{ margin: "3px 0 4px", fontSize: 13.5 }}>{t.meaning}</p>
            <div className="small-note">Used in: {t.where.map(([href, label], i) => <span key={href}>{i ? " · " : ""}<Link href={href}>{label}</Link></span>)}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Status badges</h2>
        <table style={{ fontSize: 13 }}><tbody>
          {Object.entries(STATUS).map(([k, s]) => (
            <tr key={k}><td style={{ whiteSpace: "nowrap" }}><span style={{ background: TONE[s.tone].bg, color: TONE[s.tone].fg, borderRadius: 10, padding: "1px 9px", fontSize: 11.5, fontWeight: 700 }}>{s.label}</span></td><td>{s.meaning}</td></tr>
          ))}
        </tbody></table>
        <p className="small-note" style={{ marginBottom: 0 }}>Hover over a badge anywhere in the app — or tap it on a phone — to see its meaning.</p>
      </div>
    </Shell>
  );
}
