"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RemoveButton({ url, label = "Remove", confirmText = "Remove this?" }: { url: string; label?: string; confirmText?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  async function go() {
    if (!window.confirm(confirmText)) return;
    const res = await fetch(url, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) router.refresh(); else setMsg(d.error || "Could not remove");
  }
  return <span><button className="btn" style={{ fontSize: 12 }} onClick={go}>{label}</button>{msg && <span style={{ fontSize: 11.5, color: "#b3261e", marginLeft: 6 }}>{msg}</span>}</span>;
}
