"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OmcHatButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function go() {
    if (!window.confirm(`Remove ${name} from the OMC? They stay a faculty member.`)) return;
    const res = await fetch("/api/chairman/omc-hat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "REVOKE" }) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    router.refresh();
  }
  return <span><button className="btn" onClick={go} type="button">Remove from OMC</button>{err && <span style={{ color: "#b3261e", fontSize: 12, marginLeft: 6 }}>{err}</span>}</span>;
}
