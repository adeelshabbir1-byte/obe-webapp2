import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { apply, castVote, ELECTION_HINT } from "../../../../lib/elections";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST { action: "apply", electionId, position, manifesto, plan, videoUrl? } | { action: "vote", electionId, position, candidateId }
export async function POST(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "apply") {
      const manifesto = str(b.manifesto, 3000), plan = str(b.plan, 5000), videoUrl = str(b.videoUrl, 500);
      if (manifesto.length < 30) return NextResponse.json({ error: "Write your speech or message (at least a few lines)." }, { status: 400 });
      if (plan.length < 30) return NextResponse.json({ error: "Write your plan for the year." }, { status: 400 });
      if (videoUrl && !/^https?:\/\//i.test(videoUrl)) return NextResponse.json({ error: "The video must be a link (YouTube, Google Drive, ...)." }, { status: 400 });
      await apply(student.id, str(b.electionId, 60), { position: str(b.position, 80), manifesto, plan, videoUrl: videoUrl || null });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "vote") { await castVote(student.id, str(b.electionId, 60), str(b.position, 80), str(b.candidateId, 60)); return NextResponse.json({ ok: true }); }
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? ELECTION_HINT : m }, { status: 400 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
