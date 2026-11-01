import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { overview } from "../../lib/meetingsHub";
import { membersOf, TYPES } from "../../lib/committeeEngine";
import { templateFor } from "../../lib/minutesTemplate";
import { ActionForm, Btn, Suggest, TemplateForm } from "./HubForms";

export const dynamic = "force-dynamic";

// One place for every committee meeting (Adeel prompt §24), on the committee engine. Voting, items, attendance and
// minutes stay on each committee's page (/boards); this page gathers them, plus scheduling, actions and the
// minutes template.
export default async function MeetingsHubPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const o = await overview(cid, user);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: o.actions.map((a) => a.ownerId || "").concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const instTpl = await templateFor(cid, null);
  const membersBy = new Map(await Promise.all(o.committees.filter((c) => c.manage).map(async (c) => [c.id, (await membersOf(c.id)).filter((m) => m.userId).map((m) => ({ id: m.userId!, name: m.name }))] as const)));
  const mineOpen = o.actions.filter((a) => a.ownerId === user.id && a.status === "OPEN");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Meetings</h1>
      <p className="small-note">Every committee — OMC, BOS, Faculty Board, HEC-mandated and advisory committees — on one engine: agenda items that wait for a committee are added automatically, decisions need quorum and apply to the linked item, minutes are generated, and action items follow their owners.</p>
      {mineOpen.length > 0 && <div className="card" style={{ marginBottom: 10 }}><b>My action items</b><ul style={{ fontSize: 13, paddingLeft: 18 }}>{mineOpen.map((a) => <li key={a.id}>{a.title}{a.due ? ` — due ${new Date(a.due).toLocaleDateString("en-GB")}` : ""} <Btn body={{ action: "closeAction", id: a.id }} label="Done" /></li>)}</ul></div>}
      {o.committees.map((c) => {
        const ms = o.meetings.filter((m) => m.committeeId === c.id).slice(0, 4);
        const acts = o.actions.filter((a) => a.committeeId === c.id);
        return (
          <div className="card" key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div><b>{c.name}</b> <span className="small-note">{TYPES[c.type] || c.type} · {c.mode === "FULL" ? `quorum ${c.quorumPct}%` : "Convener only"} · {c.open} item{c.open === 1 ? "" : "s"} waiting</span></div>
              <span><Link href={`/boards/${c.id}`} className="btn btn-sm">Open</Link> {c.manage && <Suggest committeeId={c.id} />}</span>
            </div>
            {ms.length > 0 && <div style={{ fontSize: 12.5, marginTop: 4 }}>{ms.map((m) => <span key={m.id} style={{ marginRight: 12 }}>{new Date(m.date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} {m.venue || ""} · <a href={`/api/meetings/ics/${m.id}`}>.ics</a>{c.manage ? <> · <Btn body={{ action: "invite", meetingId: m.id }} label="Send invitations" done="Sent ✓" /></> : null}</span>)}</div>}
            {acts.length > 0 && <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: "6px 0 0" }}>{acts.slice(0, 8).map((a) => <li key={a.id} style={{ color: a.status === "OPEN" && a.due && new Date(a.due) < new Date() ? "#B3261E" : undefined }}>{a.status === "DONE" ? "✓ " : ""}{a.title} — {a.ownerId ? names.get(a.ownerId) : "—"}{a.due ? `, due ${new Date(a.due).toLocaleDateString("en-GB")}` : ""}</li>)}</ul>}
            {c.manage && <div style={{ marginTop: 6 }}><ActionForm committeeId={c.id} members={membersBy.get(c.id) || []} /></div>}
            {c.manage && <details style={{ marginTop: 6 }}><summary className="small-note" style={{ cursor: "pointer" }}>Minutes format for this committee</summary><CommitteeTemplate committeeId={c.id} chairmanId={cid} /></details>}
          </div>
        );
      })}
      {user.role === "CHAIRMAN" && (
        <div className="card" style={{ marginBottom: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Institute default minutes format</h3>
          <TemplateForm sections={instTpl.sections} signatures={instTpl.signatures} footer={instTpl.footer} />
        </div>
      )}
      {o.legacy.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Older committees and meetings</h3>
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>{o.legacy.map((l) => <li key={l.id}>{l.name} <span className="small-note">({l._count.members} members, {l._count.meetings} meetings){l.imported ? " · moved ✓" : ""}</span></li>)}</ul>
          <p className="small-note">Their records stay on <Link href="/committees">Committees</Link> and <Link href="/meetings">Meetings and minutes</Link> until you have checked them here.</p>
          {user.role === "CHAIRMAN" && o.legacy.some((l) => !l.imported) && <Btn body={{ action: "import" }} label="Move the older committees into the engine" done="Moved ✓ — reload to see them" />}
        </div>
      )}
    </Shell>
  );
}

async function CommitteeTemplate({ committeeId, chairmanId }: { committeeId: string; chairmanId: string }) {
  const t = await templateFor(chairmanId, committeeId);
  return <TemplateForm committeeId={committeeId} sections={t.sections} signatures={t.signatures} footer={t.footer} />;
}
