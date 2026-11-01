import Link from "next/link";
import { nextTasks, type NextUser } from "../lib/nextTasks";
import { dueText, type Task } from "../lib/nextTasksCore";

// "What's next for me": this person's open tasks in order (overdue, due soon, the rest), each a link to the exact step.
// The tasks come from lib/nextTasks.ts; a source that fails is skipped, so the home page always opens.
const TONE = { overdue: ["#FBE9E7", "#B3261E", "Overdue"], soon: ["#FBF3E4", "#7A520C", "Soon"], normal: ["#EAF1FB", "#1B4F8A", ""] } as const;

function Row({ t }: { t: Task }) {
  const [bg, fg, word] = TONE[t.urgency];
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid #EEE" }}>
      <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "1px 7px", minWidth: 56, textAlign: "center" }}>{word || "To do"}</span>
      <Link href={t.href} style={{ fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 0 }}>{t.title}</Link>
      {t.detail && <span className="small-note">{t.detail}</span>}
      {t.due && !t.title.includes("due") && !t.title.includes("overdue") && <span className="small-note" style={{ whiteSpace: "nowrap" }}>{dueText(t.due)}</span>}
    </li>
  );
}

export default async function TodayPanel({ user }: { user: NextUser }) {
  let tasks: Task[] = [];
  try { tasks = (await nextTasks(user)).tasks; } catch { tasks = []; }
  const top = tasks.slice(0, 7), rest = tasks.slice(7);
  return (
    <div className="card" id="whats-next" style={{ marginBottom: 14 }} data-whats-next>
      <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>What&apos;s next {tasks.length > 0 && <span className="small-note">({tasks.length})</span>}</h3>
      {tasks.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>Nothing waiting for you ✓</p> : (
        <>
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>{top.map((t, i) => <Row key={i} t={t} />)}</ol>
          {rest.length > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>Show all ({tasks.length})</summary><ol style={{ listStyle: "none", padding: 0, margin: 0 }}>{rest.map((t, i) => <Row key={i} t={t} />)}</ol></details>}
        </>
      )}
    </div>
  );
}
