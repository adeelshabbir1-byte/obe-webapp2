"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type PaperItem = { questionNo: number; topic: string; clo: string | null; level: string | null; marks: number };
export type ExamView = {
  examType: string; status: string | null; version: number | null; itemCount: number; items: PaperItem[];
  reviews: { name: string; status: string; note: string | null }[]; myReview: { status: string; note: string | null } | null; submissionId: string | null;
};
export type TeamPanelView = {
  key: string; code: string; title: string; term: string; leadName: string | null; iAmLead: boolean; leadCourseId: string | null;
  exams: ExamView[]; others: string[];
};

const COLOR: Record<string, string> = { SUBMITTED: "#96650F", CHANGES_REQUESTED: "#b3261e", APPROVED: "var(--sage)" };
const LABEL: Record<string, string> = { SUBMITTED: "Waiting for approval", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved" };

export default function CourseTeamPanel({ teams }: { teams: TeamPanelView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function post(id: string, url: string, body: unknown) {
    setBusy(id); setError("");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(d.error || "Something went wrong"); return; }
    router.refresh();
  }
  function review(sub: string, decision: "APPROVE" | "CHANGES") {
    let note = "";
    if (decision === "CHANGES") {
      const n = window.prompt("What should change in the paper?");
      if (!n || !n.trim()) return;
      note = n;
    }
    post(sub + decision, "/api/instructor/paper-team/review", { submissionId: sub, decision, note });
  }

  return (
    <>
      {error && <div className="card" style={{ color: "#b3261e" }}>{error}</div>}
      {teams.length === 0 && <div className="card" style={{ color: "var(--slate)" }}>You do not share any course with another teacher this semester.</div>}
      {teams.map((t) => (
        <div className="card" key={t.key}>
          <h3 style={{ marginTop: 0 }}>{t.code} — {t.title}</h3>
          <p style={{ fontSize: 13, margin: "0 0 10px" }}>
            Course Lead: <b>{t.leadName || "not named yet"}</b>{t.iAmLead && " (you)"} · Other teachers: {t.others.join(", ") || "—"}{t.term ? ` · ${t.term}` : ""}
          </p>
          {!t.leadName && <p style={{ fontSize: 12.5, color: "#96650F" }}>Your Course Assigner, Program Lead or Chairman names the lead.</p>}
          {t.leadName && t.exams.map((e) => (
            <div key={e.examType} style={{ borderTop: "1px dashed var(--line, #ccc)", padding: "10px 0" }}>
              <b>{e.examType} paper</b>{" "}
              {e.status ? <span style={{ color: COLOR[e.status] }}>— {LABEL[e.status]}{e.version && e.version > 1 ? ` (version ${e.version})` : ""}</span> : <span style={{ color: "var(--slate)" }}>— not sent for approval yet</span>}

              {t.iAmLead ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 12.5, color: "var(--slate)" }}>{e.itemCount} question(s) in your paper distribution.{" "}
                    {t.leadCourseId && <Link href={`/instructor/courses/${t.leadCourseId}/paper-distribution`} style={{ color: "var(--brass-dark)" }}>Edit paper</Link>}</div>
                  {e.reviews.map((r) => <div key={r.name} style={{ fontSize: 12.5 }}>{r.name}: <span style={{ color: COLOR[r.status === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED"] }}>{r.status === "APPROVED" ? "approved" : "asked for changes"}</span>{r.note ? ` — “${r.note}”` : ""}</div>)}
                  {e.status !== "APPROVED" && (
                    <button className="btn btn-brass" style={{ marginTop: 6 }} disabled={busy === t.key + e.examType || e.itemCount === 0}
                      onClick={() => post(t.key + e.examType, "/api/instructor/paper-team/submit", { leadCourseId: t.leadCourseId, examType: e.examType })}>
                      {e.status ? "Send again for approval" : "Send for approval"}
                    </button>
                  )}
                  {e.status === "APPROVED" && <div style={{ fontSize: 12.5, color: "var(--sage)", marginTop: 4 }}>Approved by everyone; all sections now have this paper. To change it, edit and send again.</div>}
                  {e.status === "APPROVED" && (
                    <button className="btn" style={{ marginTop: 6 }} disabled={busy === t.key + e.examType}
                      onClick={() => window.confirm("Send this paper for approval again? Earlier approvals are cleared.") && post(t.key + e.examType, "/api/instructor/paper-team/submit", { leadCourseId: t.leadCourseId, examType: e.examType })}>Send again after changes</button>
                  )}
                </div>
              ) : e.submissionId ? (
                <div style={{ marginTop: 6 }}>
                  <table>
                    <thead><tr><th>Q</th><th>Topic</th><th>CLO</th><th>Level</th><th>Marks</th></tr></thead>
                    <tbody>{e.items.map((i) => <tr key={i.questionNo}><td>{i.questionNo}</td><td>{i.topic}</td><td>{i.clo || "—"}</td><td>{i.level || "—"}</td><td>{i.marks}</td></tr>)}</tbody>
                  </table>
                  {e.status === "APPROVED" ? <div style={{ fontSize: 12.5, color: "var(--sage)", marginTop: 6 }}>Approved. Your section now has this paper.</div> : (
                    <div style={{ marginTop: 8 }}>
                      {e.myReview && <div style={{ fontSize: 12.5, marginBottom: 6 }}>Your answer: <b style={{ color: e.myReview.status === "APPROVED" ? "var(--sage)" : "#b3261e" }}>{e.myReview.status === "APPROVED" ? "approved" : "changes requested"}</b>{e.myReview.note ? ` — “${e.myReview.note}”` : ""}</div>}
                      <button className="btn btn-brass" disabled={!!busy} onClick={() => review(e.submissionId!, "APPROVE")}>Approve</button>{" "}
                      <button className="btn" disabled={!!busy} onClick={() => review(e.submissionId!, "CHANGES")}>Ask for changes</button>
                    </div>
                  )}
                </div>
              ) : <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 4 }}>The lead has not sent this paper yet.</div>}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
