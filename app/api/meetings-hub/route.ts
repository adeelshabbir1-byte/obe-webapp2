import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addAction, closeAction, importLegacy, invite, suggestTimes } from "../../../lib/meetingsHub";
import { committee, canManage } from "../../../lib/committeeEngine";
import { saveTemplate } from "../../../lib/minutesTemplate";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { action } — import (old committees → engine), suggest { committeeId }, invite { meetingId },
// addAction { committeeId, title, ownerId, due, meetingId }, closeAction { id },
// template { committeeId? , sections[], signatures[], footer } | { committeeId?, reset: true }.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    switch (b.action) {
      case "import": return NextResponse.json({ imported: await importLegacy(cid, user) });
      case "suggest": return NextResponse.json({ slots: await suggestTimes(cid, String(b.committeeId)) });
      case "invite": return NextResponse.json({ sent: await invite(String(b.meetingId)) });
      case "addAction": return NextResponse.json({ id: await addAction(user, String(b.committeeId), b as never) });
      case "closeAction": await closeAction(user, String(b.id)); return NextResponse.json({ ok: true });
      case "template": {
        if (b.committeeId) { const c = await committee(String(b.committeeId)); if (!c || !canManage(user as never, c)) return NextResponse.json({ error: "Only this committee's Convener adapts its minutes." }, { status: 403 }); }
        else if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "The Institute Head sets the institute default." }, { status: 403 });
        await saveTemplate(cid, { committeeId: b.committeeId || null }, b.reset ? null : { sections: (b.sections || []).map(String), signatures: (b.signatures || []).map(String), footer: String(b.footer || "") }, user.id);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
