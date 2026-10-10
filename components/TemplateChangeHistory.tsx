export type ChangeItem = {
  id: string; courseCode: string; courseTitle: string; termLabel: string; reason: string; requestedBy: string; status: string;
  omcComment: string | null; date: string; changes: string[];
};

const STATUS: Record<string, string> = { pending: "Waiting for OMC", approved: "Reopened — being edited", rejected: "Declined", completed: "Done" };

/** Everything changed in approved templates, grouped by semester — the record used to improve courses term after term. */
export default function TemplateChangeHistory({ items, showCourse = true }: { items: ChangeItem[]; showCourse?: boolean }) {
  if (items.length === 0) return <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No changes to approved templates yet.</p>;
  const groups = new Map<string, ChangeItem[]>();
  for (const i of items) groups.set(i.termLabel, [...(groups.get(i.termLabel) || []), i]);
  return (
    <>
      {Array.from(groups.entries()).map(([term, list]) => (
        <div className="card" key={term}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{term} <span style={{ color: "var(--slate)", fontWeight: 400, fontSize: 12 }}>· {list.length} change request{list.length > 1 ? "s" : ""}</span></h3>
          {list.map((i) => (
            <div key={i.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ fontSize: 13 }}>
                {showCourse && <b>{i.courseCode} — {i.courseTitle} · </b>}
                <span style={{ color: "var(--slate)" }}>{i.date} · {i.requestedBy} · {STATUS[i.status] || i.status}</span>
              </div>
              <div style={{ fontSize: 12.5, marginTop: 3 }}><b>Why:</b> {i.reason}</div>
              {i.omcComment && <div style={{ fontSize: 12.5, color: "var(--slate)" }}><b>OMC:</b> {i.omcComment}</div>}
              {i.status === "completed" && (
                i.changes.length === 0
                  ? <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 3 }}>Resubmitted with no differences found.</div>
                  : <ul style={{ margin: "6px 0 0 18px", fontSize: 12.5 }}>{i.changes.map((c, n) => <li key={n}>{c}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
