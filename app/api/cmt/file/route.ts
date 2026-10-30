import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { withErrors } from "../../../../lib/apiHandler";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { committee, minutesPdf } from "../../../../lib/committeeEngine";
import { readStored } from "../../../../lib/sampleStorage";

const db = prisma as unknown as Record<string, any>;
/** GET ?meeting=ID&pdf=1 (generated minutes) · ?meeting=ID (signed minutes) · ?item=ID&doc=signed|council — staff of the institute. */
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const u = new URL(req.url);
  const meetingId = u.searchParams.get("meeting"), itemId = u.searchParams.get("item");
  const row = meetingId ? await db.cmtMeeting.findUnique({ where: { id: meetingId } }) : itemId ? await db.cmtItem.findUnique({ where: { id: itemId } }) : null;
  const c = row ? await committee(row.committeeId) : null;
  if (!row || !c || c.chairmanId !== (await chairmanIdFor(user as never).catch(() => ""))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (meetingId && u.searchParams.get("pdf")) {
    const { bytes, name } = await minutesPdf(meetingId);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` } });
  }
  const ref = meetingId ? row.minutesRef : u.searchParams.get("doc") === "council" ? row.councilRef : row.signedRef;
  const f = ref ? await readStored(ref) : null;
  if (!f) return NextResponse.json({ error: "No file." }, { status: 404 });
  return new NextResponse(new Uint8Array(f.buf), { headers: { "Content-Type": f.type, "Content-Disposition": "inline", "Cache-Control": "private, no-store" } });
}
export const GET = withErrors(GET_handler);
