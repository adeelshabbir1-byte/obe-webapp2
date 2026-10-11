"use client";
import { useRouter } from "next/navigation";
export default function MarkAllRead() {
  const router = useRouter();
  return <button className="btn" style={{ fontSize: 12.5 }} onClick={async () => { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); router.refresh(); }}>Mark all read</button>;
}
