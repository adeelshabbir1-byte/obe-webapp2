"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type OptionInfo = { id: string; courseCode: string; courseTitle: string; description: string | null; capacity: number | null; seatsTaken: number; full: boolean };
type GroupInfo = { id: string; label: string; semesterNumber: number; registrationOpen: boolean; finalized: boolean; myChoiceOptionId: string | null; myChoiceApplied: boolean; options: OptionInfo[] };

export default function StudentElectiveDashboard({ studentName }: { studentName: string }) {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Record<string, string>>({});

  async function load() {
    try {
      const res = await fetch("/api/student/elective-groups");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setGroups(data.groups); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function submit(group: GroupInfo) {
    const optionId = pendingSelection[group.id] || group.myChoiceOptionId;
    if (!optionId) { setError("Choose one of the options first."); return; }
    setBusyGroupId(group.id); setError("");
    try {
      const res = await fetch(`/api/student/elective-choice/${group.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyGroupId(null); return; }
      await load();
      setBusyGroupId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyGroupId(null); }
  }

  async function logout() {
    await fetch("/api/student/logout", { method: "POST" });
    router.push("/student/login");
    router.refresh();
  }

  if (!loaded) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</p>;

  const openGroups = groups.filter((g) => g.registrationOpen && !g.finalized);
  const otherGroups = groups.filter((g) => !g.registrationOpen || g.finalized);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "var(--slate)" }}>Signed in as <b>{studentName}</b></p>
        <button onClick={logout} className="act act-primary">
          Sign out
        </button>
      </div>

      {error && <div className="err">{error}</div>}

      {openGroups.length === 0 && otherGroups.length === 0 && (
        <div className="card"><p style={{ fontSize: 13, color: "var(--slate)" }}>No elective choices are available for your batch right now.</p></div>
      )}

      {openGroups.map((g) => {
        const currentSelection = pendingSelection[g.id] ?? g.myChoiceOptionId ?? "";
        return (
          <div key={g.id} className="card">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>{g.label}</h3>
            <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 14 }}>
              {g.myChoiceOptionId ? "You can change your choice below while registration is still open." : "Choose one option below."}
            </p>

            {g.options.map((o) => (
              <label
                key={o.id}
                style={{
                  display: "block", padding: "12px 14px", marginBottom: 8, cursor: o.full && currentSelection !== o.id ? "not-allowed" : "pointer",
                  border: currentSelection === o.id ? "2px solid var(--brass-dark)" : "1px solid var(--line)",
                  background: o.full && currentSelection !== o.id ? "#F3F6FD" : currentSelection === o.id ? "#F4F0FF" : "#fff",
                  opacity: o.full && currentSelection !== o.id ? 0.6 : 1,
                }}
              >
                <input
                  type="radio" name={`option-${g.id}`} value={o.id}
                  disabled={o.full && currentSelection !== o.id}
                  checked={currentSelection === o.id}
                  onChange={() => setPendingSelection((prev) => ({ ...prev, [g.id]: o.id }))}
                  style={{ marginRight: 10 }}
                />
                <b style={{ fontSize: 14 }}>{o.courseCode} — {o.courseTitle}</b>
                {o.capacity !== null && (
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: o.full ? "var(--rust)" : "var(--slate)" }}>
                    {o.full && currentSelection !== o.id ? "FULL" : `${o.capacity - o.seatsTaken} seat(s) left`}
                  </span>
                )}
                {o.description && <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 4, marginLeft: 26 }}>{o.description}</div>}
              </label>
            ))}

            <button onClick={() => submit(g)} disabled={busyGroupId === g.id} className="btn btn-approve" style={{ marginTop: 6 }}>
              {busyGroupId === g.id ? "Saving…" : g.myChoiceOptionId ? "Update My Choice" : "Submit My Choice"}
            </button>
          </div>
        );
      })}

      {otherGroups.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>Past / Closed</h3>
          {otherGroups.map((g) => {
            const myOption = g.options.find((o) => o.id === g.myChoiceOptionId);
            return (
              <div key={g.id} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <b>{g.label}</b> — {myOption ? `${myOption.courseCode} (${myOption.courseTitle})` : "No choice submitted"}
                {g.finalized && myOption && (g.myChoiceApplied ? <span style={{ color: "var(--sage)", marginLeft: 6 }}>✓ Enrolled</span> : <span style={{ color: "var(--rust)", marginLeft: 6 }}>Not placed — contact your Coordinator</span>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
