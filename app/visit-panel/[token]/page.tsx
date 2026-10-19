import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { passByToken } from "../../../lib/visitorPass";
import { BODIES, type BodyKey } from "../../../lib/accreditation/bodies";
import { sarData, sarGaps, chapters } from "../../../lib/sarBuilder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Visiting panel" };

// The visiting panel's read-only view: the program, the SAR chapters with their narratives, the downloads.
export default async function VisitPanelPage({ params }: { params: { token: string } }) {
  const p = await passByToken(params.token);
  if (!p) notFound();
  const c = await prisma.accreditationCycle.findUnique({ where: { id: p.cycleId } });
  if (!c) notFound();
  const head = await prisma.user.findUnique({ where: { id: c.chairmanId }, select: { instituteName: true, name: true } });
  const d = await sarData(c.id).catch(() => null);
  const chs = d ? chapters(d.body) : [];
  const gaps = d ? sarGaps(d).filter((g) => !g.text.startsWith("Narrative")) : [];
  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EA", padding: 20 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", background: "#fff", border: "1px solid #E4DFCE", padding: "26px 30px" }}>
        <p className="small-note" style={{ margin: 0 }}>Read-only access for the visiting panel · valid until {new Date(p.expiresAt).toISOString().slice(0, 10)}</p>
        <h1 style={{ fontSize: 22, margin: "6px 0" }}>{c.program} — {BODIES[c.body as BodyKey]?.name || c.body}</h1>
        <p className="small-note">{head?.instituteName || head?.name}{c.visitDate ? ` · visit ${c.visitDate.toISOString().slice(0, 10)}` : ""}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <a className="btn btn-brass" href={`/api/visit-panel/${params.token}?file=sar`}>Self-Assessment Report (Word)</a>
          <a className="btn btn-secondary" href={`/api/visit-panel/${params.token}?file=dossier`}>Evidence dossier (ZIP)</a>
        </div>
        {chs.map((ch, i) => { const t = d?.narr.get(ch.key) || ""; const g = gaps.filter((x) => x.ch === ch.key); return (
          <details key={ch.key} style={{ borderTop: "1px solid #E4DFCE", padding: "8px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{i + 1}. {ch.title}</summary>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, margin: "6px 0" }}>{t || <span className="small-note">No narrative written.</span>}</div>
            {g.length > 0 && <p className="small-note">Noted by the system: {g.map((x) => x.text).join(" · ")}</p>}
          </details>); })}
      </div>
    </div>
  );
}
