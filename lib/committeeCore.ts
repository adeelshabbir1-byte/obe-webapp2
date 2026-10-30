// The committee engine with no database: votes on an item and what they decide, under the committee's rule.
// Used by the OMC (its two existing rules, unchanged), the Board of Studies, and later the Faculty Board and the
// Academic Council.
//   MAJORITY_OF_MEMBERS — carried when more than half of all members approve (OMC batch approval, SE plan votes).
//   FIXED               — carried at `need` approvals, rejected at `need` rejections (OMC requests: 2, or a panel's 2 of 3).
//   QUORUM              — a quorum of members must vote (or attend); among the votes cast, approval needs the majority
//                         share; the Convener then finalises (BOS full committee).

export type VoteKind = "APPROVE" | "APPROVE_WITH_CHANGES" | "REJECT";
export const VOTE_LABEL: Record<VoteKind, string> = { APPROVE: "Approve", APPROVE_WITH_CHANGES: "Approve with changes", REJECT: "Reject" };
export type Outcome = "APPROVED" | "APPROVED_WITH_CHANGES" | "DEFERRED" | "REJECTED";
export const OUTCOME_LABEL: Record<Outcome, string> = { APPROVED: "Approved", APPROVED_WITH_CHANGES: "Approved with changes", DEFERRED: "Deferred", REJECTED: "Rejected" };
export type Rule = { kind: "MAJORITY_OF_MEMBERS" } | { kind: "FIXED"; need: number } | { kind: "QUORUM"; quorumPct: number; majorityPct: number };
export type CVote = { memberId: string; vote: VoteKind; comment?: string | null; name?: string };
export type CMember = { id: string; name: string };

/** More than half of the members. */
export const majorityOf = (memberCount: number) => Math.floor(Math.max(1, memberCount) / 2) + 1;
export const quorumOf = (memberCount: number, pct: number) => Math.max(1, Math.ceil((Math.max(1, memberCount) * pct) / 100 - 1e-9));

export function tallyVotes(members: CMember[], votes: CVote[], rule: Rule, present?: string[] | null) {
  const ids = new Set(members.map((m) => m.id));
  const valid = votes.filter((v) => ids.has(v.memberId));
  const yes = valid.filter((v) => v.vote === "APPROVE").length, changes = valid.filter((v) => v.vote === "APPROVE_WITH_CHANGES").length, no = valid.filter((v) => v.vote === "REJECT").length;
  const cast = valid.length, approveAll = yes + changes;
  const waiting = members.filter((m) => !valid.some((v) => v.memberId === m.id)).map((m) => m.name);
  let need: number, quorum: number | null = null, quorumMet = true, carried = false, failed = false;
  if (rule.kind === "MAJORITY_OF_MEMBERS") { need = majorityOf(members.length); carried = approveAll >= need; failed = no >= need; }
  else if (rule.kind === "FIXED") { need = rule.need; carried = approveAll >= need; failed = no >= need; }
  else {
    quorum = quorumOf(members.length, rule.quorumPct);
    const counted = present ? Math.max(cast, present.filter((p) => ids.has(p)).length) : cast;
    quorumMet = counted >= quorum;
    need = Math.max(1, Math.floor((cast * rule.majorityPct) / 100) + 1); // more than majorityPct of the votes cast
    carried = quorumMet && cast > 0 && approveAll >= need;
    failed = quorumMet && cast > 0 && no >= need;
  }
  // What the votes point to: approve / approve with changes / reject, or none.
  const suggested: Outcome | null = carried ? (changes > 0 && changes >= yes ? "APPROVED_WITH_CHANGES" : "APPROVED") : failed ? "REJECTED" : null;
  return { yes, changes, no, cast, total: members.length, waiting, need, quorum, quorumMet, carried, failed, suggested };
}
export type Tally = ReturnType<typeof tallyVotes>;

/**
 * The Convener finalises an item. Under a QUORUM rule: only once the quorum is met, and only to what the majority
 * decided (or "deferred"); under the OMC's rules the votes decide by themselves. Convener-only mode: any outcome.
 */
export function canFinalise(mode: "FULL" | "CONVENER_ONLY", t: Tally | null, outcome: Outcome): string | null {
  if (mode === "CONVENER_ONLY" || outcome === "DEFERRED") return null;
  if (!t) return "No votes yet.";
  if (!t.quorumMet) return `No quorum: ${t.cast} of ${t.quorum} needed have voted.`;
  if (outcome === "REJECTED") return t.failed ? null : "The majority has not rejected it.";
  if (!t.carried) return `No majority to approve yet (${t.yes + t.changes} of ${t.need} needed).`;
  if (outcome === "APPROVED" && t.suggested === "APPROVED_WITH_CHANGES") return null; // the Convener may accept the changes as made
  return null;
}
export function tallyLine(t: Tally) {
  const parts = [`${t.yes} approve`, ...(t.changes ? [`${t.changes} with changes`] : []), `${t.no} reject`];
  return `${parts.join(" · ")}${t.quorum !== null ? ` · quorum ${t.quorumMet ? "met" : `${t.cast}/${t.quorum}`}` : ""} · needs ${t.need}`;
}
