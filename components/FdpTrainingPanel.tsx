"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { daysOf, planHours, PROVISION_LABEL, type Plan, type Provisions } from "../lib/fdpPlanCore";

type Person = [string, string];
type Nom = { id: string; userId: string; status: string; reason: string | null };

async function post(body: unknown) {
  const r = await fetch("/api/fdp/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/** One training's days and times, what the university provides, nominations (HOD approves), attendance per day,
 *  certificates and the on-duty letter. */
export default function FdpTrainingPanel({ sessionId, date, plan, people, noms, days, certs, me, manage, canDecide }: { sessionId: string; date: string; plan: Plan | null; people: Person[]; noms: Nom[]; days: { userId: string; date: string }[]; certs: { userId: string; fileName: string }[]; me: string; manage: boolean; canDecide: string[] }) {
  const router = useRouter();
  const [p, setP] = useState<Plan>(plan || { startDate: date, endDate: date, same: true, start: "09:00", end: "13:00", days: [], provisions: { onDuty: true } });
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (f: () => Promise<unknown>, ok: string) => { setMsg(null); try { await f(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } };
  const list = useMemo(() => daysOf(p), [p]);
  const name = (id: string) => people.find((x) => x[0] === id)?.[1] || "—";
  const approved = noms.filter((n) => n.status === "APPROVED");
  const prov = (k: keyof Provisions, v: string | boolean) => setP({ ...p, provisions: { ...p.provisions, [k]: v } });
  const dayTime = (date: string, k: "start" | "end", v: string) => { const cur = list.find((d) => d.date === date)!; setP({ ...p, days: list.map((d) => (d.date === date ? { ...cur, [k]: v } : p.days.find((x) => x.date === d.date) || d)) }); };
  return (
    <details style={{ marginTop: 6 }} data-fdp-panel={sessionId}>
      <summary style={{ cursor: "pointer", fontSize: 13 }}>Days and times · provisions · nominations · attendance per day{plan ? ` (${daysOf(plan).length} day${daysOf(plan).length > 1 ? "s" : ""}, ${planHours(plan)} h)` : ""}</summary>
      {manage && (
        <div className="card" style={{ margin: "6px 0", padding: 10, fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label>From <input type="date" value={p.startDate} onChange={(e) => setP({ ...p, startDate: e.target.value })} aria-label="Start date" /></label>
            <label>To <input type="date" value={p.endDate} onChange={(e) => setP({ ...p, endDate: e.target.value })} aria-label="End date" /></label>
            <label><input type="checkbox" checked={p.same} onChange={(e) => setP({ ...p, same: e.target.checked })} /> Same times every day</label>
            {p.same && <><label>Starts <input type="time" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} aria-label="Starts" /></label><label>Ends <input type="time" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} aria-label="Ends" /></label></>}
          </div>
          {!p.same && <table style={{ marginTop: 6 }}><tbody>{list.map((d) => <tr key={d.date}><td>{d.date}</td><td><input type="time" value={d.start} onChange={(e) => dayTime(d.date, "start", e.target.value)} aria-label={`${d.date} starts`} /></td><td><input type="time" value={d.end} onChange={(e) => dayTime(d.date, "end", e.target.value)} aria-label={`${d.date} ends`} /></td></tr>)}</tbody></table>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {(Object.keys(PROVISION_LABEL) as (keyof typeof PROVISION_LABEL)[]).map((k) => <label key={k}>{PROVISION_LABEL[k]} <input value={String(p.provisions[k] || "")} onChange={(e) => prov(k, e.target.value)} placeholder="amount or note" style={{ width: 140 }} aria-label={PROVISION_LABEL[k]} /></label>)}
            <label><input type="checkbox" checked={p.provisions.onDuty} onChange={(e) => prov("onDuty", e.target.checked)} /> Official on-duty status (letter)</label>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => run(() => post({ action: "plan", sessionId, ...p, ...p.provisions }), "Saved — the session's date and hours follow the days.")} data-fdp-save>Save days and provisions</button>
          <span className="small-note" style={{ marginLeft: 8 }}>{list.length} day(s) · {planHours(p)} h</span>
        </div>
      )}
      <div style={{ fontSize: 13, margin: "6px 0" }}>
        <b>Nominations</b> <span className="small-note">the teacher&apos;s Head of Department approves</span>
        <ul style={{ margin: "4px 0 0 16px" }}>{noms.map((n) => (
          <li key={n.id}>{name(n.userId)} — <i>{n.status.toLowerCase()}</i>{n.reason ? ` (${n.reason})` : ""}
            {n.status === "PENDING" && canDecide.includes(n.userId) && <> <button className="btn btn-sm" onClick={() => run(() => post({ action: "decide", id: n.id, approve: true }), "Approved.")}>Approve</button> <button className="btn btn-secondary btn-sm" onClick={() => { const r = prompt("Reason for not approving?") || ""; if (r) run(() => post({ action: "decide", id: n.id, approve: false, reason: r }), "Not approved."); }}>Decline</button></>}
            {n.status === "APPROVED" && (n.userId === me || manage) && <> · <a href={`/api/fdp/plan?letter=1&sessionId=${sessionId}&userId=${n.userId}`} target="_blank" rel="noreferrer">On-duty letter</a></>}
            {certs.some((c) => c.userId === n.userId) && <> · <a href={`/api/fdp/plan?cert=1&sessionId=${sessionId}&userId=${n.userId}`} target="_blank" rel="noreferrer">Certificate</a></>}
            {(n.userId === me || manage) && n.status === "APPROVED" && <label style={{ marginLeft: 6 }} className="small-note">Upload certificate <input type="file" accept=".pdf,image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("sessionId", sessionId); fd.set("userId", n.userId); fd.set("file", f); const r = await fetch("/api/fdp/plan", { method: "POST", body: fd }); setMsg(r.ok ? { ok: true, text: "Certificate saved." } : { ok: false, text: (await r.json().catch(() => ({}))).error || "Failed." }); router.refresh(); }} /></label>}
          </li>))}</ul>
        {manage && <div style={{ display: "flex", gap: 6, marginTop: 4 }}><select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Teacher to nominate"><option value="">Nominate a teacher…</option>{people.filter((x) => !noms.some((n) => n.userId === x[0])).map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}</select><button className="btn btn-sm" disabled={!pick} onClick={() => run(() => post({ action: "nominate", sessionId, userIds: [pick] }), "Nominated — sent to the Head of Department.")}>Nominate</button></div>}
      </div>
      {manage && approved.length > 0 && list.length > 0 && (
        <div style={{ fontSize: 13, overflowX: "auto" }}>
          <b>Attendance per day</b>
          <table><thead><tr><th>Teacher</th>{list.map((d) => <th key={d.date}>{d.date.slice(5)}</th>)}</tr></thead>
            <tbody>{approved.map((n) => <tr key={n.id}><td>{name(n.userId)}</td>{list.map((d) => { const on = days.some((x) => x.userId === n.userId && x.date === d.date); return <td key={d.date}><input type="checkbox" checked={on} aria-label={`${name(n.userId)} on ${d.date}`} onChange={() => { const now = days.filter((x) => x.date === d.date).map((x) => x.userId); run(() => post({ action: "day", sessionId, date: d.date, userIds: on ? now.filter((u) => u !== n.userId) : now.concat(n.userId) }), "Attendance saved."); }} /></td>; })}</tr>)}</tbody></table>
        </div>
      )}
      {msg && <div className={msg.ok ? "small-note" : "err"}>{msg.text}</div>}
    </details>
  );
}
