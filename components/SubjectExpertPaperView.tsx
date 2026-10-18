import { prisma } from "../lib/db";

/**
 * The Subject Expert's planned Midterm / Final papers for a course, read-only — shown to the Instructor beside their
 * own paper so the actual papers can follow (or knowingly differ from) the approved plan.
 */
export default async function SubjectExpertPaperView({ courseId }: { courseId: string }) {
  const [items, rows, clos] = await Promise.all([
    prisma.paperDistributionItem.findMany({ where: { courseId, source: "SE" }, orderBy: [{ examType: "asc" }, { orderIndex: "asc" }] }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { id: true, topic: true, lectureNumber: true } }),
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, select: { id: true, code: true, mappedPlo: { select: { number: true } } } }),
  ]);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const cloById = new Map(clos.map((c) => [c.id, c]));
  const examOf = (i: { examType: string | null }) => i.examType || "Paper";
  const exams = Array.from(new Set(items.map(examOf)));

  return (
    <details className="card" open={items.length > 0}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
        Subject Expert&apos;s planned papers <span className="small-note" style={{ fontWeight: 400 }}>({items.length ? `${items.length} questions` : "none yet"}, read-only)</span>
      </summary>
      {items.length === 0 ? (
        <p className="small-note" style={{ marginBottom: 0 }}>The Subject Expert has not planned the paper distribution for this course yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 14, marginTop: 10 }}>
          {exams.map((exam) => {
            const list = items.filter((i) => examOf(i) === exam);
            const total = list.reduce((n, i) => n + (i.marks || 0), 0);
            return (
              <div key={exam}>
                <h4 style={{ margin: "0 0 6px" }}>{exam} <span className="small-note">({list.length} questions, {Math.round(total * 100) / 100} marks)</span></h4>
                <table>
                  <thead><tr><th style={{ width: 60 }}>Q</th><th>Topic</th><th style={{ width: 90 }}>CLO</th><th style={{ width: 90 }}>Level</th><th style={{ width: 80 }}>Marks</th></tr></thead>
                  <tbody>
                    {list.map((i) => {
                      const row = i.lectureRowId ? rowById.get(i.lectureRowId) : null;
                      const clo = i.cloId ? cloById.get(i.cloId) : null;
                      return (
                        <tr key={i.id}>
                          <td>{i.questionNo}</td>
                          <td>{i.topicText || row?.topic || "—"}{row ? <span className="small-note"> · lecture {row.lectureNumber}</span> : null}</td>
                          <td>{clo ? `${clo.code}${clo.mappedPlo ? ` (GA-${clo.mappedPlo.number})` : ""}` : "—"}</td>
                          <td>{i.cognitiveLevel || "—"}</td>
                          <td>{i.marks ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}
