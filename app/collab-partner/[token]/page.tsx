import { prisma } from "../../../lib/db";
import { partnerOf, partnerView } from "../../../lib/collabPartner";
import { KINDS } from "../../../lib/collab";
import PartnerNoteForm from "../../../components/PartnerNoteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Joint programme — partner access", robots: { index: false } };

// A partner university's focal person: this one programme only — its steps, course mapping and MoC items — with a
// comment or "agree" per step. Nothing else of the institute is reachable with this link.
export default async function PartnerPage({ params }: { params: { token: string } }) {
  const g = await partnerOf(params.token).catch(() => null);
  if (!g) return <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}><h1 style={{ fontSize: 20 }}>Link not valid</h1><p>This partner link has expired or was revoked. Ask the programme&apos;s lead for a new one.</p></main>;
  const v = partnerView(g.p);
  const inst = await prisma.user.findUnique({ where: { id: g.p.chairmanId }, select: { name: true } }).catch(() => null);
  return (
    <main style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px", lineHeight: 1.5 }}>
      <p className="small-note" style={{ margin: 0 }}>{inst?.name} · partner access for {g.link.contact || g.link.partner}, {g.link.partner} · valid until {g.link.expires.slice(0, 10)}</p>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>{v.title}</h1>
      <p className="small-note">{KINDS[v.kind]} · partners: {v.partners.map((x) => x.name).join(", ") || "—"}{v.mocFrom ? ` · MoC ${v.mocFrom} to ${v.mocUntil}` : ""}</p>
      {v.cem.length > 0 && <div className="card" style={{ overflowX: "auto" }}><h2 style={{ fontSize: 16, marginTop: 0 }}>Course mapping</h2><table style={{ fontSize: 12.5 }}><thead><tr><th>Our course</th><th>Partner course</th><th>CH</th><th>Contact hours</th><th>Equivalent</th></tr></thead><tbody>{v.cem.map((c, i) => <tr key={i}><td>{c.ours} {c.oursTitle}</td><td>{c.theirs} {c.theirsTitle}</td><td>{c.ch}</td><td>{c.contactHours}</td><td>{c.ok ? "Yes" : "To agree"}</td></tr>)}</tbody></table></div>}
      {v.steps.map((s, i) => {
        const notes = v.notes.filter((n) => n.step === s.key);
        return (
          <section key={s.key} className="card" data-step={s.key}>
            <h2 style={{ fontSize: 16, margin: 0 }}>{i + 1}. {s.title} {s.missing.length === 0 ? "✓" : ""}</h2>
            <p style={{ fontSize: 13 }}>{s.intro}</p>
            {s.moc.length > 0 && <div style={{ fontSize: 13 }}>{s.moc.map((m) => <p key={m.k} style={{ margin: "4px 0" }}><b>({m.k}) {m.item}</b><br />{m.text || <span className="small-note">not written yet</span>}</p>)}</div>}
            {s.missing.length > 0 && <p className="small-note">Still open: {s.missing.join("; ")}</p>}
            {notes.map((n, k) => <div key={k} style={{ fontSize: 13, padding: 6, borderRadius: 6, background: n.agree ? "#E6F4EA" : "#F1F4F9", marginTop: 4 }}><b>{n.partner}</b> {n.agree ? "agreed" : "commented"} · {n.at.slice(0, 10)}{n.text ? <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div> : null}</div>)}
            <PartnerNoteForm token={params.token} step={s.key} />
          </section>
        );
      })}
    </main>
  );
}
