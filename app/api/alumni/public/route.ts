import { NextRequest, NextResponse } from "next/server";
import { addVoice, alumniByToken, answerRequest, ALUMNI_HINT } from "../../../../lib/alumniVoice";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Public (link-based) actions of alumni: answer a faculty member's request; suggest; offer a workshop.
async function POST_handler(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "answer") {
      const answers: Record<string, string> = {};
      for (const [k, v] of Object.entries(b)) if (/^q\d+$/.test(k)) answers[k] = str(v, 2000);
      await answerRequest(str(b.token, 60), answers, { email: str(b.email, 160), employer: str(b.employer, 160), jobTitle: str(b.jobTitle, 160), degree: str(b.degree, 200) });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "suggest" || b.action === "workshop") {
      const al = await alumniByToken(str(b.me, 60));
      if (!al) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
      const title = str(b.title, 160), text = str(b.text, 5000);
      if (title.length < 4 || text.length < 20) return NextResponse.json({ error: "Give a title and a few lines." }, { status: 400 });
      await addVoice(al.id, { kind: b.action === "workshop" ? "WORKSHOP" : "SUGGESTION", courseCode: str(b.courseCode, 30) || null, title, text, preferredDates: str(b.preferredDates, 200) || null, audience: str(b.audience, 200) || null });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /does not exist|relation/i.test(m) ? ALUMNI_HINT : m || "Could not save." }, { status: 400 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
export const POST = withErrors(POST_handler);
