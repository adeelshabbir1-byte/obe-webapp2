import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { skillsOf } from "../../../lib/skillsTranscript";

export const dynamic = "force-dynamic";

// The student's skills transcript: graduate attributes, final year project and co-curricular activities on one page.
export default async function SkillsTranscriptPage() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const t = await skillsOf(st.id).catch(() => null);
  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>My skills transcript</h1>
        <p className="small-note">What employers understand: how strong you are in each graduate attribute, your final year project and your activities. Your grades are on your transcript. <a className="btn btn-sm" href="/api/skills-transcript">Download PDF</a></p>
        {!t || !t.gas.length ? <div className="card"><p>Nothing yet — attributes appear once your first courses are on your transcript.</p></div> : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 13 }}><thead><tr><th>GA</th><th>Attribute</th><th>Attainment</th><th>Level</th></tr></thead>
              <tbody>{t.gas.map((g) => <tr key={g.number}><td>GA-{g.number}</td><td>{g.title}</td><td><div style={{ background: "#EEE", borderRadius: 4, width: 140, height: 10, display: "inline-block", verticalAlign: "middle" }}><div style={{ width: `${Math.min(100, g.pct) * 1.4}px`, height: 10, borderRadius: 4, background: g.pct >= 60 ? "#1E6B4F" : g.pct >= 50 ? "#C58A12" : "#B3261E" }} /></div> {g.pct}%</td><td>{g.level}</td></tr>)}</tbody></table>
          </div>
        )}
        {t && t.fyp.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Final year project</h3>{t.fyp.map((f) => <p key={f.group}>{f.title || f.group}{f.grade ? ` — grade ${f.grade}` : ""}</p>)}</div>}
        {t && t.activities.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Activities</h3><ul>{t.activities.map((a, i) => <li key={i}>{a.society} — {a.position} ({a.term})</li>)}</ul></div>}
      </div>
    </StudentShell>
  );
}
