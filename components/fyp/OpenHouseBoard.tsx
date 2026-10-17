"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fypPost } from "./FypClient";

type Item = { id: string; kind: string; title: string; groupId: string | null; ownerId: string | null; ownerText: string | null; room: string | null; startAt: string | null; endAt: string | null; qty: number | null; vendor: string | null; status: string; note: string | null };
const SECTIONS: { kind: string; title: string; help: string; fields: string[]; statuses: string[] }[] = [
  { kind: "INTERVIEW", title: "Company interview rooms", help: "Each company's room and time slot. Two companies in one room at the same time are flagged.", fields: ["title:Company", "room:Room", "startAt:From", "endAt:To", "ownerText:Contact person"], statuses: ["PLANNED", "CONFIRMED", "DONE"] },
  { kind: "USHER", title: "Ushers", help: "Who guides visitors where and when. One person in two places at once is flagged.", fields: ["title:Duty / zone", "owner:Usher", "room:Location", "startAt:From", "endAt:To"], statuses: ["PLANNED", "CONFIRMED", "DONE"] },
  { kind: "REFRESHMENT", title: "Refreshments", help: "Items for participants — quantities suggested from the number of people expected.", fields: ["title:Item", "qty:Quantity", "vendor:Vendor", "startAt:Serve at", "owner:Responsible"], statuses: ["PLANNED", "ORDERED", "DELIVERED"] },
  { kind: "PRINT", title: "Printing (posters, banners, certificates)", help: "Poster of every group: students submit the link on their FYP page by the deadline, you approve and print.", fields: ["title:Item", "qty:Copies", "vendor:Printer", "endAt:Deadline", "owner:Responsible"], statuses: ["NOT_SUBMITTED", "SUBMITTED", "APPROVED", "PRINTED"] },
  { kind: "OTHER", title: "Other arrangements", help: "Sound system, stage, chairs, security, parking, photography …", fields: ["title:Arrangement", "owner:Responsible", "room:Where", "startAt:When", "note:Notes"], statuses: ["PLANNED", "CONFIRMED", "DONE"] },
];

export default function OpenHouseBoard({ cycleId, items, people, clashes, participants, canEdit }: { cycleId: string; items: Item[]; people: { id: string; name: string }[]; clashes: string[]; participants: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, Record<string, string>>>({});
  const [msg, setMsg] = useState("");
  const call = async (body: Record<string, unknown>) => { const r = await fypPost("/api/fyp/open-house", { cycleId, ...body }); if (r.ok) { setMsg(""); router.refresh(); return true; } setMsg(r.error || "Could not save."); return false; };
  const who = (i: Item) => people.find((p) => p.id === i.ownerId)?.name || i.ownerText || "";
  const total = Object.values(participants).reduce((a, b) => a + b, 0);
  const t = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "");
  return (
    <div>
      <div className="card" style={{ fontSize: 13 }}>
        <b>Expected participants: {total}</b> — {Object.entries(participants).map(([k, v]) => `${k} ${v}`).join(" · ")}. <span className="small-note">Plan refreshments for about {Math.ceil(total * 1.1)} (10% extra).</span>
      </div>
      {msg && <div className="err">{msg}</div>}
      {clashes.length > 0 && <div className="card" style={{ background: "#FBEDEB", fontSize: 12.5 }}><b>Clashes</b>{clashes.map((c, i) => <div key={i}>• {c}</div>)}</div>}
      {SECTIONS.map((sec) => {
        const rows = items.filter((i) => i.kind === sec.kind);
        const f = form[sec.kind] || {};
        const done = rows.filter((r) => r.status === sec.statuses[sec.statuses.length - 1]).length;
        return (
          <div className="card" key={sec.kind}>
            <h3 style={{ marginTop: 0 }}>{sec.title} <span className="small-note">{rows.length ? `${done}/${rows.length} ${sec.statuses[sec.statuses.length - 1].toLowerCase()}` : ""}</span></h3>
            <p className="small-note" style={{ marginTop: 0 }}>{sec.help}</p>
            {sec.kind === "PRINT" && canEdit && <span><input type="date" id="posterDue" /> <button className="act" onClick={() => call({ action: "posters", due: (document.getElementById("posterDue") as HTMLInputElement)?.value })}>Create a poster item for every group</button></span>}
            {rows.length > 0 && <table style={{ fontSize: 12.5, marginTop: 6 }}><tbody>{rows.map((i) => (
              <tr key={i.id}><td><b>{i.title}</b>{i.note && <div className="small-note">{/^https?:/.test(i.note) ? <a href={i.note} target="_blank" rel="noopener noreferrer">submitted file</a> : i.note}</div>}</td><td>{who(i)}</td><td>{i.room || ""}</td><td className="small-note">{t(i.startAt)}{i.endAt ? ` → ${t(i.endAt)}` : ""}</td><td>{i.qty ?? ""}</td><td>{i.vendor || ""}</td>
                <td>{canEdit ? <select value={i.status} onChange={(e) => call({ action: "status", id: i.id, status: e.target.value })}>{sec.statuses.map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select> : i.status.toLowerCase()}</td>
                <td>{canEdit && <button className="act act-danger" onClick={() => confirm("Delete?") && call({ action: "delete", id: i.id })}>✕</button>}</td></tr>))}</tbody></table>}
            {canEdit && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6, fontSize: 12.5 }}>
                {sec.fields.map((fd) => { const [k, label] = fd.split(":"); const set = (v: string) => setForm({ ...form, [sec.kind]: { ...f, [k]: v } });
                  return <label key={k}>{label}<br />{k === "owner" ? <select value={f.ownerId || ""} onChange={(e) => setForm({ ...form, [sec.kind]: { ...f, ownerId: e.target.value } })}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    : <input type={k === "startAt" || k === "endAt" ? "datetime-local" : k === "qty" ? "number" : "text"} value={f[k] || ""} onChange={(e) => set(e.target.value)} style={{ width: k === "title" ? 200 : k === "qty" ? 70 : undefined }} placeholder={k === "qty" && sec.kind === "REFRESHMENT" ? String(Math.ceil(total * 1.1)) : ""} />}</label>; })}
                <button className="btn btn-sm" onClick={async () => { if (await call({ action: "add", kind: sec.kind, ...f })) setForm({ ...form, [sec.kind]: {} }); }}>Add</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
