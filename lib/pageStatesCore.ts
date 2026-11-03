// Card colours, the "checked" states (queue item 9): a page with a check is green (complete this term), grey (not set
// up yet) or amber / red (work needed); tasks still give red / amber / blue on top. Pure helpers.
export type PageState = { status: "green" | "grey" | "amber" | "red" | "blue"; reason: string };
/** All of n complete → green; none to check → grey; some missing → amber (red when nothing is done at all). */
export function fromCounts(total: number, done: number, what: string, missing: string): PageState {
  if (total === 0) return { status: "grey", reason: `Not set up yet — no ${what}` };
  if (done >= total) return { status: "green", reason: `✓ ${what}: all ${total} complete this term` };
  return { status: done === 0 ? "red" : "amber", reason: `${total - done} of ${total} ${what} ${missing}` };
}
