import Link from "next/link";
import { nextTasks, type NextUser } from "../lib/nextTasks";
import { dueText, type Task } from "../lib/nextTasksCore";
import { statusOf, taskKey } from "../lib/menuStatusCore";
import { AMBER_KEY, waitingFor } from "../lib/menuStatus";
import { chainFor, getFlag, numberSetting } from "../lib/scopedSettings";
import { DigestChoice, WaitButton } from "./TaskTools";

// "What's next for me": this person's open tasks in order (overdue, due soon, the rest), each a link to the exact step.
// The tasks come from lib/nextTasks.ts; a source that fails is skipped, so the home page always opens.
const TONE = { red: ["#FBE9E7", "#B3261E", "! Overdue"], amber: ["#FBF3E4", "#7A520C", "⚠ Soon"], blue: ["#EAF1FB", "#1B4F8A", "To do"], grey: ["#F1F1F1", "#666", "Waiting"] } as const;

function Row({ t, tone, waiting }: { t: Task; tone: keyof typeof TONE; waiting?: boolean }) {
  const [bg, fg, word] = TONE[tone];
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid #EEE" }}>
      <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "1px 7px", minWidth: 56, textAlign: "center" }}>{word}</span>
      <Link href={t.href} style={{ fontWeight: 600, fontSize: 13.5, flex: 1, minWidth: 0 }}>{t.title}</Link>
      {t.detail && <span className="small-note">{t.detail}</span>}
      {t.due && !t.title.includes("due") && !t.title.includes("overdue") && <span className="small-note" style={{ whiteSpace: "nowrap" }}>{dueText(t.due)}</span>}
      {t.source !== "waiting" && <WaitButton title={t.title} href={t.href} waiting={waiting} />}
    </li>
  );
}

export default async function TodayPanel({ user }: { user: NextUser }) {
  let tasks: Task[] = [];
  try { tasks = (await nextTasks(user)).tasks; } catch { tasks = []; }
  const now = new Date();
  const [amber, waiting, digest] = await Promise.all([
    chainFor({ id: user.id, role: user.role, managedById: user.managedById, departmentId: user.departmentId }).then((c) => numberSetting(c, AMBER_KEY, 3)).catch(() => 3),
    waitingFor(user.id).catch(() => Object.assign(new Set<string>(), { expired: new Set<string>() })),
    getFlag(user.id, "digest").catch(() => null),
  ]);
  const toneOf = (t: Task): keyof typeof TONE => (waiting.has(taskKey(t)) ? "grey" : waiting.expired.has(taskKey(t)) ? "red" : statusOf(t, amber, now));
  const open = tasks.filter((t) => !waiting.has(taskKey(t))), parked = tasks.filter((t) => waiting.has(taskKey(t)));
  const top = open.slice(0, 7), rest = open.slice(7);
  // My week: the next 7 days' deadlines, in date order.
  const week = open.filter((t) => t.due && new Date(t.due).getTime() - now.getTime() <= 7 * 864e5).sort((a, b) => +new Date(a.due!) - +new Date(b.due!));
  return (
    <div className="card" id="whats-next" style={{ marginBottom: 14 }} data-whats-next>
      <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>What&apos;s next {open.length > 0 && <span className="small-note">({open.length})</span>}</h3>
      {open.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)", margin: 0 }}>Nothing waiting for you ✓</p> : (
        <>
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>{top.map((t, i) => <Row key={i} t={t} tone={toneOf(t)} />)}</ol>
          {rest.length > 0 && <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>Show all ({open.length})</summary><ol style={{ listStyle: "none", padding: 0, margin: 0 }}>{rest.map((t, i) => <Row key={i} t={t} tone={toneOf(t)} />)}</ol></details>}
        </>
      )}
      {week.length > 0 && (
        <div style={{ marginTop: 10 }} id="my-week">
          <h4 style={{ fontSize: 13.5, margin: "0 0 4px" }}>My week</h4>
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>{week.map((t, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 13, padding: "3px 0" }}>
              <span style={{ minWidth: 86, color: "var(--slate)" }}>{new Date(t.due!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
              <Link href={t.href}>{t.title}</Link>
            </li>
          ))}</ol>
        </div>
      )}
      {parked.length > 0 && <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>Waiting on someone else ({parked.length})</summary><ol style={{ listStyle: "none", padding: 0, margin: 0 }}>{parked.map((t, i) => <Row key={i} t={t} tone="grey" waiting />)}</ol></details>}
      <div style={{ marginTop: 8 }}><DigestChoice value={digest || "off"} /></div>
    </div>
  );
}
