import type { CvData } from "../lib/studentCv";

// One printable CV page (A4). Used by the CV page and the batch CV book.
export default function CvDocument({ v }: { v: { student: { name: string; rollNumber: string; batch: { degreeProgram: string; batchName: string } }; data: CvData; cgpa: number | null; fyp: { title: string; abstract: string | null; domain: string | null } | null; institute: string } }) {
  const d = v.data;
  const H = ({ t }: { t: string }) => <h3 style={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: "#3A1218", borderBottom: "1.5px solid #3A1218", margin: "14px 0 6px", paddingBottom: 2 }}>{t}</h3>;
  const contact = [d.email, d.phone, d.city, d.linkedin, d.github, d.portfolio].filter(Boolean);
  return (
    <div className="cv-page" style={{ background: "#fff", maxWidth: 800, margin: "0 auto 20px", padding: "36px 44px", fontFamily: "Georgia, 'Times New Roman', serif", color: "#222", fontSize: 13, lineHeight: 1.45, pageBreakAfter: "always" }}>
      <h1 style={{ fontSize: 26, margin: 0, fontFamily: "inherit" }}>{v.student.name}</h1>
      {d.headline && <div style={{ fontSize: 14, color: "#555" }}>{d.headline}</div>}
      <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{contact.join("  ·  ")}</div>
      {d.summary && <><H t="Profile" /><p style={{ margin: 0 }}>{d.summary}</p></>}
      <H t="Education" />
      <div><b>{v.student.batch.degreeProgram}</b> — {v.institute}<div style={{ color: "#555" }}>{v.student.batch.batchName} · Roll no. {v.student.rollNumber}{v.cgpa != null ? ` · CGPA ${v.cgpa.toFixed(2)}` : ""}</div></div>
      {(v.fyp || d.projects.length > 0) && <H t="Projects" />}
      {v.fyp && <div style={{ marginBottom: 6 }}><b>Final Year Project: {v.fyp.title}</b>{v.fyp.domain ? <span style={{ color: "#555" }}> · {v.fyp.domain}</span> : null}{v.fyp.abstract && <div style={{ color: "#444" }}>{v.fyp.abstract.slice(0, 400)}{v.fyp.abstract.length > 400 ? "…" : ""}</div>}</div>}
      {d.projects.map((p, i) => <div key={i} style={{ marginBottom: 6 }}><b>{p.title}</b>{p.link && <span style={{ color: "#555" }}> · {p.link}</span>}{p.text && <div>{p.text}</div>}</div>)}
      {d.experience.length > 0 && <><H t="Experience" />{d.experience.map((x, i) => <div key={i} style={{ marginBottom: 6 }}><b>{x.role}</b>{x.org ? `, ${x.org}` : ""} <span style={{ color: "#555" }}>{[x.from, x.to].filter(Boolean).join(" – ")}</span>{x.text && <div>{x.text}</div>}</div>)}</>}
      {d.skills.length > 0 && <><H t="Skills" /><div>{d.skills.join(" · ")}</div></>}
      {d.certifications.length > 0 && <><H t="Certifications" />{d.certifications.map((c, i) => <div key={i}>{c.name}{c.by ? ` — ${c.by}` : ""}{c.year ? ` (${c.year})` : ""}</div>)}</>}
      {d.achievements.length > 0 && <><H t="Achievements" /><ul style={{ margin: 0, paddingLeft: 18 }}>{d.achievements.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
      {d.languages.length > 0 && <><H t="Languages" /><div>{d.languages.join(" · ")}</div></>}
    </div>
  );
}
