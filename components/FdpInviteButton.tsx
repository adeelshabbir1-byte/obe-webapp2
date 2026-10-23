"use client";
import { useState } from "react";

/** Invite a teacher to an FDP session because one feedback question scored low. */
export default function FdpInviteButton({ sessionId, userId, questionKey, scoreBefore }: { sessionId: string; userId: string; questionKey: string; scoreBefore: number | null }) {
  const [state, setState] = useState<"" | "busy" | "done" | string>("");
  if (state === "done") return <span className="small-note" style={{ color: "#1E7B45" }}>✓ invited</span>;
  return (
    <>
      <button type="button" className="act" disabled={state === "busy"} onClick={async () => {
        setState("busy");
        const r = await fetch("/api/evaluations/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, userId, questionKey, scoreBefore }) });
        const d = await r.json().catch(() => ({}));
        setState(r.ok ? "done" : d.error || "Could not invite.");
      }}>Invite</button>
      {state && state !== "busy" && <span className="err" style={{ marginLeft: 4 }}>{state}</span>}
    </>
  );
}
