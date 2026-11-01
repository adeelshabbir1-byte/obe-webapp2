import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { decideCredit } from "../../../lib/studentStatus";
import { suggestionsFor } from "../../../lib/transferMatch";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { requestId, action: "acceptStrong" } — accept every strong suggestion (each checked by the transfer rules),
// or { creditId, accept, toCode, exemption } for one line (exemption: "EX" — no credits; shown as EX).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { requestId?: string; action?: string; creditId?: string; accept?: boolean; toCode?: string; exemption?: boolean };
  try {
    if (b.action === "acceptStrong") {
      const { rows } = await suggestionsFor(String(b.requestId));
      const done: string[] = [], failed: string[] = [];
      for (const r of rows.filter((x) => x.status === "PENDING" && x.best?.label.startsWith("Strong"))) {
        try { await decideCredit(user, r.creditId, true, r.best!.code, `Suggested match: ${r.best!.label}`); done.push(r.fromCode); } catch (e) { failed.push(`${r.fromCode}: ${(e as Error).message}`); }
      }
      return NextResponse.json({ done, failed });
    }
    await decideCredit(user, String(b.creditId), !!b.accept, b.toCode || null, b.exemption ? "EX — exemption (no credits)" : null);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
