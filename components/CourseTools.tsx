"use client";

import { useState } from "react";

// One course's teaching tools (queue item 14 B): link the class, then each tool's actions; live sessions and forum hours.
type Link = { tool: string; label: string; externalId: string; note: string | null; at: string | null };
type Inst = { id: string; label: string; type: string };
type Session = { id: string; lectureNumber: number; tool: string; startsAt: string; joinUrl: string | null; status: string; recordingUrl: string | null; attendees: number | null; heldMinutes: number | null; syncNote: string | null; ended: boolean };
type Forum = { forumId: string; week: number; forumName: string; graded: boolean; posts: number; teacherPosts: number; students: number; hours: number | null };

const api = (b: Record<string, unknown>) => fetch("/api/course-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));

export function ToolCard({ courseId, link, canAct, instruments }: { courseId: string; link: Link; canAct: boolean; instruments: Inst[] }) {
  const [ext, setExt] = useState(link.externalId); const [classes, setClasses] = useState<{ id: string; name: string }[] | null>(null);
  const [msg, setMsg] = useState(link.note ? `${link.note}${link.at ? ` (${link.at.slice(0, 16).replace("T", " ")})` : ""}` : ""); const [busy, setBusy] = useState(false);
  const [inst, setInst] = useState(instruments[0]?.id || "");
  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg("Working…");
    const r = await api({ courseId, tool: link.tool, action, ...extra }); setBusy(false);
    setMsg(r.error || r.message || "Done.");
    if (!r.error && ["link", "live", "sync", "forums", "videos"].includes(action)) setTimeout(() => location.reload(), 900);
    if (r.link) window.open(r.link, "_blank", "noopener");
  };
  const choose = async () => {
    setBusy(true); const r = await fetch(`/api/course-tools?courseId=${courseId}&tool=${link.tool}&do=classes`).then((x) => x.json()).catch(() => ({ error: "Could not reach OBEHUB." })); setBusy(false);
    if (r.error) setMsg(r.error); else setClasses(r.classes || []);
  };
  const linked = !!link.externalId;
  const b = (label: string, action: string, extra: Record<string, unknown> = {}, title?: string) => <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !canAct} title={title} onClick={() => run(action, extra)}>{label}</button>;
  return (
    <div className="card" style={{ margin: 0 }} data-tool={link.tool}>
      <b>{link.label}</b>
      {link.tool !== "YOUTUBE" && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "6px 0", fontSize: 12.5 }}>
        {link.tool === "MOODLE" ? "Moodle course id" : "Class"}
        {classes ? <select value={ext} onChange={(e) => setExt(e.target.value)}><option value="">— choose —</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          : <input value={ext} onChange={(e) => setExt(e.target.value.trim())} placeholder={link.tool === "MOODLE" ? "e.g. 245" : "class id"} style={{ width: 150 }} disabled={!canAct} />}
        {link.tool !== "MOODLE" && !classes && canAct && <button type="button" className="btn-link" disabled={busy} onClick={choose}>pick from the teacher&apos;s classes</button>}
        {canAct && <button type="button" className="btn btn-sm" disabled={busy || ext === link.externalId} onClick={() => run("link", { externalId: ext })}>{ext ? "Link" : "Unlink"}</button>}
        {linked && <span style={{ color: "#1E6B3A" }}>✓ linked</span>}
      </div>}
      {(linked || link.tool === "YOUTUBE") && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {link.tool === "MOODLE" && <>{b("Enrol the class", "enrol", {}, "Students by ID number = roll number; missing accounts are created when a student email pattern is set")}{b("A section per lecture topic", "sections")}{b("Read forum activity", "forums")}</>}
        {(link.tool === "GOOGLE" || link.tool === "MICROSOFT") && <>{b("Check the class list", "roster")}{link.tool === "GOOGLE" && b("Invite missing students", "invite")}
          {b(link.tool === "GOOGLE" ? "Meet links for live lectures" : "Teams meetings for live lectures", "live", { all: false }, "Lectures marked Live online in the ODL plan, dated in the lecture log")}
          {b("…for every dated lecture", "live", { all: true })}
          {b("Read attendance and recordings", "sync")}
          <span style={{ display: "inline-flex", gap: 4 }}><select value={inst} onChange={(e) => setInst(e.target.value)} aria-label="Assessment to post" disabled={!canAct}>{instruments.map((i) => <option key={i.id} value={i.id}>{i.label} ({i.type})</option>)}</select>{b("Post it", "post", { instrumentId: inst })}</span></>}
        {link.tool === "YOUTUBE" && b("Read video lengths", "videos", {}, "Titles, lengths and captions of the videos in this course's ODL modules")}
      </div>}
      {msg && <p className="small-note" role="status" style={{ margin: "6px 0 0" }}>{msg}</p>}
    </div>
  );
}

export function SessionRow({ courseId, s, canAct }: { courseId: string; s: Session; canAct: boolean }) {
  const [st, setSt] = useState(s.status); const [rec, setRec] = useState(s.recordingUrl?.startsWith("teams-recording:") ? "" : s.recordingUrl || ""); const [att, setAtt] = useState(s.attendees == null ? "" : String(s.attendees)); const [m, setM] = useState("");
  const save = async (d: Record<string, unknown>) => { const r = await api({ courseId, tool: s.tool, action: "mark", sessionId: s.id, ...d }); setM(r.error || "✓"); };
  return <tr>
    <td>{s.lectureNumber}</td><td>{new Date(s.startsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td><td>{s.tool === "GOOGLE" ? "Meet" : "Teams"}</td>
    <td>{s.joinUrl ? <a href={s.joinUrl} target="_blank" rel="noopener noreferrer">Join link</a> : "—"}</td>
    <td><select value={st} disabled={!canAct} onChange={(e) => { setSt(e.target.value); save({ status: e.target.value }); }}><option value="PLANNED">planned</option><option value="HELD">held</option><option value="NOT_HELD">not held</option></select></td>
    <td>{s.recordingUrl?.startsWith("teams-recording:") ? <span className="small-note">in the Teams meeting</span> : <input value={rec} disabled={!canAct} onChange={(e) => setRec(e.target.value)} onBlur={() => rec !== (s.recordingUrl || "") && save({ recordingUrl: rec })} placeholder="https://…" style={{ width: 160 }} aria-label={`Recording of lecture ${s.lectureNumber}`} />}</td>
    <td><input type="number" value={att} disabled={!canAct} onChange={(e) => setAtt(e.target.value)} onBlur={() => save({ attendees: att })} style={{ width: 60 }} aria-label={`Attendees of lecture ${s.lectureNumber}`} />{s.heldMinutes != null && <span className="small-note"> · {s.heldMinutes} min</span>}</td>
    <td className="small-note">{m || s.syncNote || ""}</td>
  </tr>;
}

export function ForumRow({ courseId, f, canAct }: { courseId: string; f: Forum; canAct: boolean }) {
  const [h, setH] = useState(f.hours == null ? "" : String(f.hours)); const [g, setG] = useState(f.graded); const [m, setM] = useState("");
  const save = async (d: Record<string, unknown>) => { const r = await api({ courseId, tool: "MOODLE", action: "hours", forumId: f.forumId, week: f.week, ...d }); setM(r.error || "✓"); };
  return <tr><td>{f.week}</td><td>{f.forumName}</td><td><label><input type="checkbox" checked={g} disabled={!canAct} onChange={(e) => { setG(e.target.checked); save({ graded: e.target.checked, hours: h }); }} /> graded</label></td><td>{f.posts} by {f.students} students</td><td>{f.teacherPosts}</td>
    <td><input type="number" step="0.5" value={h} disabled={!canAct} onChange={(e) => setH(e.target.value)} onBlur={() => save({ hours: h })} style={{ width: 60 }} aria-label={`Contact hours, ${f.forumName} week ${f.week}`} /> <span className="small-note">{m}</span></td></tr>;
}
