import { qrSvg, SIGN_HINT, type Issued } from "../lib/signoff";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// The sign-off block printed at the foot of an official page: one column per recorded approval (signature image when
// the person has uploaded one), the institute stamp, the document number and a QR code that opens the verification page.
export default function SignOffBlock({ issued, compact }: { issued: Issued | null; compact?: boolean }) {
  if (!issued) return <p className="small-note no-print" style={{ color: "#9A3412" }}>{SIGN_HINT}</p>;
  return (
    <div style={{ marginTop: compact ? 18 : 28, borderTop: "1px solid #bbb", paddingTop: 12, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", breakInside: "avoid", pageBreakInside: "avoid", fontFamily: "Arial, sans-serif", color: "#222", textAlign: "left" }}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", flex: "1 1 360px", alignItems: "flex-end" }}>
        {issued.signers.length === 0 && <span style={{ fontSize: 12, color: "#666" }}>No approvals recorded for this document yet.</span>}
        {issued.signers.map((s, i) => (
          <div key={i} style={{ minWidth: 150, maxWidth: 220 }}>
            <div style={{ height: 46, display: "flex", alignItems: "flex-end" }}>
              {s.userId && issued.signatures[s.userId] ? <img src={issued.signatures[s.userId]} alt={`Signature of ${s.name}`} style={{ maxHeight: 44, maxWidth: 170 }} /> : null}
            </div>
            <div style={{ borderTop: "1px solid #444", paddingTop: 3, fontSize: 12.5, fontWeight: 700 }}>{s.name}</div>
            <div style={{ fontSize: 11.5 }}>{s.title}</div>
            <div style={{ fontSize: 10.5, color: "#555" }}>{s.role} · {when(s.at)}</div>
          </div>
        ))}
        {issued.stamp && <img src={issued.stamp} alt="Institute stamp" style={{ maxHeight: 80, maxWidth: 110, opacity: 0.9 }} />}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ textAlign: "right", fontSize: 10.5, lineHeight: 1.4, maxWidth: 230 }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>Document No. {issued.docNo}</div>
          <div>Issued {when(new Date(issued.issuedAt).toISOString())}</div>
          <div>Scan to verify, or open</div>
          <div style={{ wordBreak: "break-all" }}>{issued.url.replace(/\?h=.*/, "")}</div>
          {issued.revoked && <div style={{ color: "#B3261E", fontWeight: 700 }}>REVOKED — not valid</div>}
        </div>
        <span dangerouslySetInnerHTML={{ __html: qrSvg(issued.url, compact ? 86 : 104) }} />
      </div>
    </div>
  );
}
