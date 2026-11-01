import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { openFor } from "../../../lib/midFeedback";
import MidFeedbackForm from "./MidFeedbackForm";

export const dynamic = "force-dynamic";

// Mid-semester feedback for the student's courses whose survey is open (Adeel prompt §6). Anonymous.
export default async function MidFeedbackPage() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const open = await openFor(st.id).catch(() => []);
  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22 }}>Mid-semester feedback</h1>
        <p className="small-note">Two minutes per course. Your teacher sees only the totals (from 5 answers), never who said what.</p>
        {open.length === 0 ? <div className="card"><p>No feedback is open for you right now.</p></div> : open.map((c) => (
          <div key={c.courseId} className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0, fontSize: 15 }}>{c.code} {c.title} <span className="small-note">· open until {c.closes.toLocaleDateString("en-GB")}</span></h3>
            <MidFeedbackForm courseId={c.courseId} topics={c.topics} />
          </div>
        ))}
      </div>
    </StudentShell>
  );
}
