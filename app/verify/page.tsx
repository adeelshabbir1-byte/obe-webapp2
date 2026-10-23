import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Public: type the number printed on a document to check it.
export default function VerifyStart({ searchParams }: { searchParams: { no?: string } }) {
  if (searchParams.no && searchParams.no.trim()) redirect(`/verify/${encodeURIComponent(searchParams.no.trim().toUpperCase())}`);
  return (
    <main style={{ minHeight: "100vh", background: "#F7F2F1", padding: "32px 16px", fontFamily: "Arial, sans-serif", color: "#221" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 12, padding: 22 }}>
        <div style={{ fontSize: 13, letterSpacing: 1.5, color: "#7A1F2B", fontWeight: 700 }}>OBEHUB · DOCUMENT VERIFICATION</div>
        <h1 style={{ fontSize: 22, margin: "8px 0" }}>Check a document</h1>
        <p style={{ fontSize: 14.5 }}>Scan the QR code on the document, or type the document number printed beside it.</p>
        <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="no" placeholder="e.g. DU-TR-2026-7KQ4MZ" style={{ flex: "1 1 220px", padding: "10px 12px", fontSize: 16, border: "1px solid #bbb", borderRadius: 8 }} />
          <button type="submit" style={{ padding: "10px 18px", fontSize: 15, background: "#7A1F2B", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700 }}>Check</button>
        </form>
      </div>
    </main>
  );
}
