"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plo = { id: string; number: number; title: string };
type Survey = { id: string; title: string; stakeholderType: string; questions: { id: string; text: string }[]; _count: { responses: number } };

const QUICK_START_TEMPLATES: Record<string, { title: string; stakeholderType: string; questions: string[] }> = {
  alumni: {
    title: "Alumni Exit Survey",
    stakeholderType: "ALUMNI",
    questions: [
      "My degree program adequately prepared me for the demands of my current job.",
      "I am able to apply core knowledge from my field to solve real-world problems.",
      "I can communicate effectively, both in writing and verbally, in professional settings.",
      "I understand and apply professional and ethical responsibilities in my work.",
      "I regularly engage in continued learning to keep my skills current.",
    ],
  },
  employer: {
    title: "Employer Feedback Survey",
    stakeholderType: "EMPLOYER",
    questions: [
      "Graduates from this program demonstrate strong technical/domain knowledge.",
      "Graduates from this program work effectively as part of a team.",
      "Graduates from this program communicate clearly in both written and verbal form.",
      "Graduates from this program exhibit professionalism and sound ethical judgment.",
      "Graduates from this program adapt well to new tools, technologies, and problems.",
    ],
  },
  student: {
    title: "Current Student Satisfaction Survey",
    stakeholderType: "STUDENT",
    questions: [
      "I am satisfied with the overall quality of teaching in my program.",
      "The curriculum adequately covers the skills relevant to my career goals.",
      "I have adequate access to labs, resources, and faculty support when I need it.",
      "I feel prepared to tackle real-world problems in my field.",
      "Overall, I am satisfied with my educational experience in this program.",
    ],
  },
};

export default function SurveysManager({ surveys, plos }: { surveys: Survey[]; plos: Plo[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [stakeholderType, setStakeholderType] = useState("STUDENT");
  const [questions, setQuestions] = useState<{ text: string; mappedPloId: string }[]>([{ text: "", mappedPloId: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function useTemplate(key: keyof typeof QUICK_START_TEMPLATES) {
    const t = QUICK_START_TEMPLATES[key];
    setTitle(t.title);
    setStakeholderType(t.stakeholderType);
    setQuestions(t.questions.map((text) => ({ text, mappedPloId: "" })));
  }

  function updateQuestion(i: number, field: "text" | "mappedPloId", value: string) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, [field]: value } : q)));
  }
  function addQuestion() { setQuestions((prev) => [...prev, { text: "", mappedPloId: "" }]); }
  function removeQuestion(i: number) { setQuestions((prev) => prev.filter((_, idx) => idx !== i)); }

  async function createSurvey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validQuestions = questions.filter((q) => q.text.trim());
    if (!title.trim() || validQuestions.length === 0) { setError("Give the survey a title and at least one question."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/surveys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, stakeholderType, questions: validQuestions.map((q) => ({ text: q.text, mappedPloId: q.mappedPloId || null })) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setTitle(""); setQuestions([{ text: "", mappedPloId: "" }]); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Existing Surveys</h3>
        <table>
          <thead><tr><th>Title</th><th>Stakeholder</th><th>Questions</th><th>Responses Sent</th><th></th></tr></thead>
          <tbody>
            {surveys.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>None created yet.</td></tr>}
            {surveys.map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td><td>{s.stakeholderType}</td><td>{s.questions.length}</td><td>{s._count.responses}</td>
                <td><a href={`/coordinator/surveys/${s.id}`} className="btn btn-brass" style={{ padding: "3px 10px", fontSize: 11, textDecoration: "none" }}>Manage</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Create a New Survey</h3>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 6 }}>Quick Start — pre-fill with a standard template, then adjust as needed</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => useTemplate("alumni")} style={{ background: "none", border: "1px solid var(--brass)", color: "var(--brass-dark)", padding: "5px 12px", fontSize: 11.5, cursor: "pointer" }}>Alumni Exit Survey</button>
            <button type="button" onClick={() => useTemplate("employer")} style={{ background: "none", border: "1px solid var(--brass)", color: "var(--brass-dark)", padding: "5px 12px", fontSize: 11.5, cursor: "pointer" }}>Employer Feedback Survey</button>
            <button type="button" onClick={() => useTemplate("student")} style={{ background: "none", border: "1px solid var(--brass)", color: "var(--brass-dark)", padding: "5px 12px", fontSize: 11.5, cursor: "pointer" }}>Student Satisfaction Survey</button>
          </div>
        </div>
        <form onSubmit={createSurvey}>
          <div style={{ display: "flex", gap: 14 }}>
            <div className="field" style={{ flex: 2 }}><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Alumni Exit Survey 2026" /></div>
            <div className="field" style={{ flex: 1 }}>
              <label>Stakeholder Group</label>
              <select value={stakeholderType} onChange={(e) => setStakeholderType(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", width: "100%" }}>
                <option value="STUDENT">Current Students</option>
                <option value="ALUMNI">Alumni</option>
                <option value="EMPLOYER">Employers</option>
              </select>
            </div>
          </div>

          <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 6 }}>Questions (each rated 1–5 by the respondent)</label>
          {questions.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <textarea value={q.text} onChange={(e) => updateQuestion(i, "text", e.target.value)} rows={2} placeholder="e.g. Graduates apply core engineering knowledge effectively" style={{ flex: 2, padding: 8, border: "1px solid var(--line)" }} />
              <select value={q.mappedPloId} onChange={(e) => updateQuestion(i, "mappedPloId", e.target.value)} style={{ flex: 1, padding: "8px 6px", border: "1px solid var(--line)" }}>
                <option value="">No PLO mapping</option>
                {plos.map((p) => <option key={p.id} value={p.id}>PLO-{p.number}: {p.title}</option>)}
              </select>
              <button type="button" onClick={() => removeQuestion(i)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, cursor: "pointer" }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addQuestion} style={{ background: "none", border: "1px dashed var(--line)", padding: "4px 10px", fontSize: 11.5, cursor: "pointer", marginBottom: 14 }}>+ Add Question</button>
          <br />
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Survey"}</button>
        </form>
      </div>
    </>
  );
}
