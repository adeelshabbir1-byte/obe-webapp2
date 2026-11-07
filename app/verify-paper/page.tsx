import { verify } from "../../lib/paperGen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify an exam paper" };

// Public: a partner university checks a paper's code — course, exam, version, when it was generated and when its
// settings were approved. Never the questions.
export default async function VerifyPaper({ searchParams }: { searchParams: { code?: string } }) {
  const r = searchParams.code ? await verify(searchParams.code).catch(() => null) : null;
  const d = (x: Date | null) => (x ? new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  return <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
    <h1 style={{ fontSize: 22 }}>Verify an exam paper</h1>
    <form><input name="code" defaultValue={searchParams.code || ""} placeholder="Check code on the paper" style={{ padding: 8, width: 240 }} /> <button style={{ padding: "8px 14px" }}>Check</button></form>
    {searchParams.code && (r ? <div style={{ marginTop: 16, padding: 14, border: "1px solid #1E6B3A", borderRadius: 8 }}>
      <b style={{ color: "#1E6B3A" }}>✓ Genuine OBEHUB-generated paper</b>
      <p style={{ margin: "8px 0 0" }}>{r.institute} · {r.course} · {r.examType} · version {r.version}<br />Generated {d(r.generatedAt)} from the course question bank. Settings checked by the Program Lead {d(r.plAt)} and approved by the OMC {d(r.omcAt)}.</p></div>
      : <p style={{ marginTop: 16, color: "#B3261E" }}>No paper with that code.</p>)}
  </main>;
}
