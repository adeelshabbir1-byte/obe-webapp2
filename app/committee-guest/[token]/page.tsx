import { prisma } from "../../../lib/db";
import { VoteForm } from "../../../components/BoardClient";
import { OUTCOME_LABEL, VOTE_LABEL } from "../../../lib/committeeCore";
import { TYPES, guest, itemsOf, votesOf } from "../../../lib/committeeEngine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Committee items", robots: { index: false } };

// An external member's guest page: only their own committee's agenda items, with their vote. Nothing else of the
// institute is reachable with this link.
export default async function GuestCommittee({ params }: { params: { token: string } }) {
  const g = await guest(params.token).catch(() => null);
  if (!g) return <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}><h1 style={{ fontSize: 20 }}>Link not valid</h1><p>This guest link has expired or was replaced. Ask the committee&apos;s Convener for a new one.</p></main>;
  const inst = await prisma.user.findUnique({ where: { id: g.committee.chairmanId }, select: { name: true } });
  const items = await itemsOf(g.committee.id);
  const votes = await votesOf(items.map((i) => i.id));
  return (
    <main style={{ maxWidth: 820, margin: "24px auto", padding: 16 }}>
      <p className="small-note" style={{ margin: 0 }}>{inst?.name} · guest access for {g.member.name}{g.member.organisation ? `, ${g.member.organisation}` : ""}</p>
      <h1 style={{ fontSize: 22, margin: "4px 0 2px" }}>{g.committee.name}</h1>
      <p className="small-note" style={{ marginBottom: 12 }}>{TYPES[g.committee.type]} — you see only this committee&apos;s items.</p>
      {items.length === 0 && <p>Nothing on the agenda yet.</p>}
      {items.map((it) => {
        const mine = votes.find((v) => v.itemId === it.id && v.memberId === g.member.id);
        return (
          <div key={it.id} className="card" data-item={it.title}>
            <b>{it.title}</b> <span className="small-note">· {it.status === "DECIDED" ? OUTCOME_LABEL[it.outcome!] : "Open"}</span>
            {it.summary && <p style={{ margin: "4px 0", fontSize: 13, whiteSpace: "pre-line" }}>{it.summary}</p>}
            {mine && <p className="small-note" style={{ margin: "2px 0" }}>Your vote: {VOTE_LABEL[mine.vote]}{mine.comment ? ` — ${mine.comment}` : ""}</p>}
            {it.status === "OPEN" && g.committee.mode === "FULL" && <VoteForm itemId={it.id} token={params.token} current={mine ? { vote: mine.vote, comment: mine.comment } : null} />}
          </div>
        );
      })}
    </main>
  );
}
