"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Lib = { seats: number; totalTitles: number; computingTitles: number; totalVolumes: number; printJournals: number; ebooks: number; databases: string | null; openHoursPerWeek: number | null; hasLibrarian: boolean; lastStockCheck: string | null; notes: string | null };

export default function LibraryInventoryForm({ lib, canEdit }: { lib: Lib | null; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(Array.from(fd.entries()));
    body.hasLibrarian = fd.get("hasLibrarian") === "on";
    const res = await fetch("/api/library-inventory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  const inp = { padding: "6px 8px", border: "1px solid var(--line)", width: "100%" } as const;
  const dis = !canEdit;
  const f = (label: string, el: React.ReactNode, wide?: boolean) => <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}><label>{label}</label>{el}</div>;
  const num = (name: string, v: number | null | undefined) => <input name={name} type="number" min={0} defaultValue={v ?? ""} disabled={dis} style={inp} />;
  return (
    <form className="card" onSubmit={submit}>
      {msg && <div style={{ marginBottom: 10, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        {f("Reading seats", num("seats", lib?.seats))}
        {f("Book titles (all subjects)", num("totalTitles", lib?.totalTitles))}
        {f("Of which computing titles", num("computingTitles", lib?.computingTitles))}
        {f("Total copies (volumes)", num("totalVolumes", lib?.totalVolumes))}
        {f("Printed journals subscribed", num("printJournals", lib?.printJournals))}
        {f("E-books available", num("ebooks", lib?.ebooks))}
        {f("Open hours per week", num("openHoursPerWeek", lib?.openHoursPerWeek))}
        {f("Last stock check", <input name="lastStockCheck" type="date" defaultValue={lib?.lastStockCheck ? lib.lastStockCheck.slice(0, 10) : ""} disabled={dis} style={inp} />)}
        {f("Digital databases subscribed (HEC digital library, IEEE, ACM, Springer …)", <textarea name="databases" rows={3} defaultValue={lib?.databases || ""} disabled={dis} style={inp} />, true)}
        {f("Notes", <textarea name="notes" rows={2} defaultValue={lib?.notes || ""} disabled={dis} style={inp} />, true)}
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="hasLibrarian" defaultChecked={!!lib?.hasLibrarian} disabled={dis} /> A qualified librarian is in post</label>
      </div>
      {canEdit && <button className="btn btn-brass" type="submit" style={{ marginTop: 12 }}>Save</button>}
    </form>
  );
}
