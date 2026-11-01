"use client";

import { useState } from "react";

const post = (b: unknown) => fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
export function AcceptStrong({ requestId }: { requestId: string }) {
  const [m, setM] = useState("");
  return <span><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ requestId, action: "acceptStrong" }); setM(r.error || `Accepted ${r.done.length}${r.failed.length ? ` · not accepted: ${r.failed.join("; ")}` : ""}`); setTimeout(() => location.reload(), 1500); }}>Accept all strong matches</button> {m}</span>;
}
export function Line({ creditId, code }: { creditId: string; code: string }) {
  const [c, setC] = useState(code); const [m, setM] = useState("");
  const go = async (accept: boolean, exemption = false) => { const r = await post({ creditId, accept, toCode: c, exemption }); setM(r.error || (accept ? (exemption ? "EX ✓" : "TR ✓") : "Rejected")); };
  return <span style={{ display: "inline-flex", gap: 6, fontSize: 12.5 }}><input value={c} onChange={(e) => setC(e.target.value.toUpperCase())} style={{ width: 80 }} /><button type="button" className="btn btn-sm" onClick={() => go(true)}>Transfer (TR)</button><button type="button" className="btn-link" onClick={() => go(true, true)}>Exempt (EX)</button><button type="button" className="btn-link" onClick={() => go(false)}>Reject</button> {m}</span>;
}
