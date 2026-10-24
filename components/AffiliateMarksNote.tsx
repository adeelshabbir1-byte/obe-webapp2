import { marksStatus } from "../lib/affiliates";

// On an affiliated college's course: the university's marks distribution, which parts the college enters and which
// the university enters, and whether both sides are in (the result is final only then).
export default async function AffiliateMarksNote({ courseId }: { courseId: string }) {
  const s = await marksStatus(courseId).catch(() => null);
  if (!s) return null;
  const uni = s.policy.heads.filter((h) => h.by === "UNIVERSITY");
  return (
    <div className="card" style={{ background: "#F6F8FC", borderColor: "#C9D6EA" }}>
      <b>Marks distribution set by your university</b> <span className="small-note">({s.policy.scope})</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
        {s.policy.heads.map((h) => <span key={h.type} style={{ fontSize: 12, borderRadius: 999, padding: "2px 9px", background: h.by === "UNIVERSITY" ? "#EEF1F4" : "#E2F4E8", color: h.by === "UNIVERSITY" ? "#556" : "#1F5E36" }}>{h.type} {h.pct}% · {h.by === "UNIVERSITY" ? "entered by university 🔒" : "you enter"}</span>)}
      </div>
      <div style={{ fontSize: 12.5 }}>College marks: <b style={{ color: s.college.done ? "#1F5E36" : "#8A5A0F" }}>{s.college.done ? "done" : `${s.college.got} of ${s.college.need}`}</b>{uni.length > 0 && <> · University marks: <b style={{ color: s.university.done ? "#1F5E36" : "#8A5A0F" }}>{s.university.done ? "done" : "pending"}</b></>}
        {uni.length > 0 && !(s.college.done && s.university.done) && <span className="small-note"> — the result and OBE attainment are final once both are in.</span>}</div>
    </div>
  );
}
