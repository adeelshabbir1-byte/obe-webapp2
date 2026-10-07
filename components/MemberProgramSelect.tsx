"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Coordinator = { id: string; label: string };

// Moves a faculty member to a program (i.e. to that program's coordinator / lead).
export default function MemberProgramSelect({ userId, current, coordinators }: { userId: string; current: string | null; coordinators: Coordinator[] }) {
  const router = useRouter();
  const [value, setValue] = useState(current || "");
  const [error, setError] = useState("");
  async function change(coordinatorId: string) {
    if (!coordinatorId) return;
    setError("");
    const res = await fetch("/api/faculty-program", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, coordinatorId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Could not move"); return; }
    setValue(coordinatorId);
    router.refresh();
  }
  return (
    <span>
      <select value={value} onChange={(e) => change(e.target.value)}>
        {!value && <option value="">— choose program —</option>}
        {coordinators.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      {error && <span style={{ color: "#b3261e", marginLeft: 6, fontSize: 12 }}>{error}</span>}
    </span>
  );
}
