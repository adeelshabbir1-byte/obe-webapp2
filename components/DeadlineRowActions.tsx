"use client";

import { useRouter } from "next/navigation";

export default function DeadlineRowActions({ id, canTick, done, canRemove }: { id: string; canTick: boolean; done: boolean; canRemove: boolean }) {
  const router = useRouter();
  async function tick() {
    const res = await fetch("/api/deadlines/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done: !done }) });
    if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error || "Something went wrong"); }
  }
  async function remove() {
    if (!confirm("Remove this deadline?")) return;
    const res = await fetch(`/api/deadlines?id=${id}`, { method: "DELETE" });
    if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error || "Something went wrong"); }
  }
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {canTick && <button className="btn" style={{ fontSize: 12, marginRight: 4 }} onClick={tick}>{done ? "Undo" : "Mark done"}</button>}
      {canRemove && <button className="btn" style={{ fontSize: 12 }} onClick={remove}>Remove</button>}
    </span>
  );
}
