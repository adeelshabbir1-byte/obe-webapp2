"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const post = (body: Record<string, unknown>) => fetch("/api/accreditation/visit-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));

/** Status of one plan / checklist line, changed on the spot (plan changes notify every faculty member). */
export function ItemStatus({ cycleId, id, status, options }: { cycleId: string; id: string; status: string; options: [string, string][] }) {
  const router = useRouter();
  const [v, setV] = useState(status);
  const [busy, setBusy] = useState(false);
  return (
    <select value={v} disabled={busy} aria-label="Status" style={{ fontSize: 12 }} onChange={async (e) => {
      const nv = e.target.value; const note = nv === "DELAYED" ? prompt("Note for everyone (e.g. new time):") : null;
      setBusy(true); const r = await post({ cycleId, action: "update", id, status: nv, ...(note !== null ? { note } : {}) }); setBusy(false);
      if (r.ok) { setV(nv); router.refresh(); } else alert(r.d.error || "Could not update.");
    }}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  );
}

/** Owner of a line (visit team only). */
export function ItemOwner({ cycleId, id, ownerId, people }: { cycleId: string; id: string; ownerId: string | null; people: [string, string][] }) {
  const router = useRouter();
  return (
    <select defaultValue={ownerId || ""} aria-label="In charge" style={{ fontSize: 12, maxWidth: 160 }} onChange={async (e) => { const r = await post({ cycleId, action: "update", id, ownerId: e.target.value }); if (r.ok) router.refresh(); else alert(r.d.error || "Could not update."); }}>
      <option value="">— in charge —</option>
      {people.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

/** Reload the page every 30 seconds so the plan stays live on every screen. */
export function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return <span className="small-note">Live — refreshes every {seconds} s</span>;
}
