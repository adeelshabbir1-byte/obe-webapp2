import Link from "next/link";
import { S } from "../../lib/securityFacts";

export const metadata = { title: "Security & data protection" };



export default function SecurityPage() {
  return (
    <main style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px", lineHeight: 1.55 }}>
      <Link href="/login" className="small-note">← Sign in</Link>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Security &amp; data protection</h1>
      <p className="small-note">How OBEHUB keeps university data safe. For procurement and IT reviews. <a href="/api/security-pdf">Download as PDF</a></p>
      {S.map(([h, items]) => <section key={h} className="card"><h2 style={{ fontSize: 17, marginTop: 0 }}>{h}</h2><ul style={{ margin: 0, paddingLeft: 20 }}>{items.map((t) => <li key={t}>{t}</li>)}</ul></section>)}
    </main>
  );
}
