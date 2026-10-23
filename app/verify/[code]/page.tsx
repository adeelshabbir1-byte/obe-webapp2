import { headers } from "next/headers";
import { verify, KIND_LABEL, SIGN_HINT, type Signer } from "../../../lib/signoff";
import { getSignedInUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const LOOK = {
  GENUINE: { bg: "#E7F4EC", fg: "#1E6B3A", title: "Genuine", text: "This document was issued by the institute and has not been withdrawn. Check that the details below match the paper copy." },
  ALTERED: { bg: "#FDECEA", fg: "#B3261E", title: "Altered — does not match", text: "The document number exists, but the code printed with it does not match the document on record. The copy may have been changed. Ask the institute for a fresh copy." },
  REVOKED: { bg: "#FDECEA", fg: "#B3261E", title: "Revoked", text: "The institute has withdrawn this document. It is no longer valid." },
  NOT_FOUND: { bg: "#FFF3DC", fg: "#9A3412", title: "Not found", text: "No document with this number was issued through OBEHUB. Check the number, or contact the institute." },
} as const;

// Public page (no sign-in): anyone who scans the QR code on an official document sees whether it is genuine.
export default async function VerifyPage({ params, searchParams }: { params: { code: string }; searchParams: { h?: string } }) {
  const h = headers();
  const viewer = await getSignedInUser().catch(() => null);
  const c = await verify(decodeURIComponent(params.code), searchParams.h || null, { checkerId: viewer?.id || null, ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || null, userAgent: h.get("user-agent") });
  const wrap = (body: React.ReactNode) => (
    <main style={{ minHeight: "100vh", background: "#F7F2F1", padding: "32px 16px", fontFamily: "Arial, sans-serif", color: "#221" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 13, letterSpacing: 1.5, color: "#7A1F2B", fontWeight: 700, marginBottom: 8 }}>OBEHUB · DOCUMENT VERIFICATION</div>
        {body}
        <p style={{ fontSize: 12, color: "#666", marginTop: 18 }}>Check another document: <a href="/verify">enter its number</a>.</p>
      </div>
    </main>
  );
  if (c === "missing") return wrap(<div style={{ background: "#fff", padding: 20, borderRadius: 10 }}>{SIGN_HINT}</div>);
  const l = LOOK[c.result];
  const d = c.doc;
  const summary = d ? (JSON.parse(d.summaryJson || "{}") as Record<string, string | number | null>) : {};
  const signers = d ? (JSON.parse(d.signersJson || "[]") as Signer[]) : [];
  const day = (x: Date | string) => new Date(x).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return wrap(
    <>
      <div style={{ background: l.bg, border: `2px solid ${l.fg}`, borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: l.fg }}>{c.result === "GENUINE" ? "✓ " : c.result === "NOT_FOUND" ? "? " : "✗ "}{l.title}</div>
        <p style={{ margin: "6px 0 0", fontSize: 15 }}>{l.text}</p>
        {d?.revokedAt && <p style={{ margin: "6px 0 0", fontSize: 14 }}><b>Revoked on {day(d.revokedAt)}</b>{d.revokeReason ? ` — ${d.revokeReason}` : ""}</p>}
      </div>
      {d && (
        <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
            <tbody>
              {([["Issued by", c.instituteName || "—"], ["Document", `${KIND_LABEL[d.kind] || d.kind}: ${d.title}`], ["Document No.", d.docNo], ["Issued to", [d.holderName, d.holderRef].filter(Boolean).join(" · ") || "—"], ["Issued on", day(d.issuedAt)], ...Object.entries(summary).map(([k, v]) => [k, v === null ? "—" : String(v)] as [string, string])] as [string, string][]).map(([k, v]) => (
                <tr key={k}><td style={{ padding: "6px 10px 6px 0", color: "#665", fontWeight: 700, verticalAlign: "top", width: "34%" }}>{k}</td><td style={{ padding: "6px 0" }}>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 style={{ fontSize: 16, margin: "14px 0 6px" }}>Signed off by</h2>
          {signers.length === 0 ? <p style={{ fontSize: 14, color: "#666" }}>No approvals recorded.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, lineHeight: 1.6 }}>{signers.map((s, i) => <li key={i}><b>{s.name}</b>, {s.title} — {s.role}, {day(s.at)}</li>)}</ul>
          )}
          <p style={{ fontSize: 11.5, color: "#777", marginTop: 14, wordBreak: "break-all" }}>Content fingerprint (SHA-256): {d.contentHash}</p>
        </div>
      )}
    </>
  );
}
