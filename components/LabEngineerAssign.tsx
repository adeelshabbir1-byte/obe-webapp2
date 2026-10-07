"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LabEngineerAssign({ courseId, current, engineers }: { courseId: string; current: string | null; engineers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function change(v: string) {
    setErr("");
    const res = await fetch("/api/coordinator/lab-engineers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, labEngineerId: v || null }) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    router.refresh();
  }
  return (
    <span>
      <select defaultValue={current || ""} onChange={(e) => change(e.target.value)}>
        <option value="">— none —</option>
        {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      {err && <span style={{ color: "#c62828", fontSize: 12, marginLeft: 6 }}>{err}</span>}
    </span>
  );
}
