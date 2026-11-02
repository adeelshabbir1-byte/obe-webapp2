import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { studentCloDash } from "../../../lib/studentCloDash";
import { practiceCounts } from "../../../lib/practicePool";
import { resourceCounts } from "../../../lib/topicResources";

export const dynamic = "force-dynamic";

// My CLOs (Adeel prompt §7): plain language — which outcomes of each course are cleared, which not yet, and what to practise.
export default async function MyClosPage() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const list = await studentCloDash(st.id).catch(() => []);
  const counts = await Promise.all(list.map((c) => practiceCounts(c.courseId)));
  const rcounts = await Promise.all(list.map((c) => resourceCounts(c.courseId)));
  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>My course outcomes (CLOs)</h1>
        <p className="small-note">For each course this semester: which learning outcomes you have cleared so far, which not yet, and the topics to practise. Your GA progress across the whole program is on <Link href="/student/obe-analytics">My OBE Progress</Link>.</p>
        {list.length === 0 && <div className="card"><p>Nothing to show yet — marks will appear here as your teachers enter them.</p></div>}
        {list.map((c, ci) => {
          const pc = counts[ci] || {}, rc = rcounts[ci] || {};
          const cleared = c.clos.filter((x) => x.status === "CLEARED"), notYet = c.clos.filter((x) => x.status === "NOT_CLEARED");
          return (
            <div key={c.courseId} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>{c.code} {c.title}</h3>
              <p style={{ fontSize: 13.5 }}>{cleared.length ? <>You have cleared <b>{cleared.map((x) => x.code).join(", ")}</b>. </> : null}{notYet.length ? <>{notYet.map((x) => `${x.code}${x.statement ? ` (${x.statement})` : ""}`).join("; ")} {notYet.length === 1 ? "is" : "are"} <b style={{ color: "#B3261E" }}>not cleared yet</b>.</> : cleared.length ? "Well done ✓" : "Not assessed yet."}</p>
              <ul style={{ fontSize: 13, paddingLeft: 18 }}>{c.clos.map((x) => <li key={x.cloId}><b>{x.code}</b> — {x.status === "CLEARED" ? "✅ cleared" : x.status === "NOT_CLEARED" ? "🔴 not yet" : "⚪ not assessed yet"}{x.pct != null ? ` (${Math.round(x.pct)}%)` : ""}</li>)}</ul>
              {notYet.some((x) => pc[x.code] || rc[x.code]) && <p style={{ fontSize: 13 }} data-practice-links><b>Practise now:</b> {notYet.filter((x) => pc[x.code] || rc[x.code]).map((x) => <Link key={x.cloId} href={`/student/practice/${c.courseId}?clo=${encodeURIComponent(x.code)}`} style={{ marginRight: 10 }}>{x.code} ({[pc[x.code] ? `${pc[x.code]} question${pc[x.code] === 1 ? "" : "s"}` : "", rc[x.code] ? `${rc[x.code]} resource${rc[x.code] === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ")})</Link>)}</p>}
              {c.weakTopics.length > 0 && <p style={{ fontSize: 13, background: "#FFF8E1", padding: 8, borderRadius: 6 }}><b>Practise:</b> {c.weakTopics.join(", ")} <span className="small-note">(from {c.weakItems.join(", ")})</span>. Ask your teacher or advisor about a tutorial.</p>}
            </div>
          );
        })}
      </div>
    </StudentShell>
  );
}
