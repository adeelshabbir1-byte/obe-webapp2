import { NextResponse } from "next/server";
import { exdb, FORMS } from "../../../../lib/exitSurveys";
import { withErrors } from "../../../../lib/apiHandler";

// Submit an exit survey by its private link (no login: the person may already have left).
async function POST_handler(req: Request, { params }: { params: { token: string } }) {
  const s = (await exdb.exitSurvey.findUnique({ where: { token: params.token } }).catch(() => null)) as { id: string; kind: string; submittedAt: Date | null } | null;
  if (!s) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  if (s.submittedAt) return NextResponse.json({ error: "Already submitted. Thank you." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const form = FORMS[s.kind];
  const out: Record<string, string | number | boolean> = {};
  for (const q of form.questions) {
    const v = b[q.key];
    if (q.type === "rating" && Number(v) >= 1 && Number(v) <= 5) out[q.key] = Math.round(Number(v));
    else if (q.type === "choice" && q.options!.includes(v)) out[q.key] = v;
    else if (q.type === "yesno" && typeof v === "boolean") out[q.key] = v;
    else if (q.type === "text" && typeof v === "string" && v.trim()) out[q.key] = v.trim().slice(0, 2000);
  }
  if (!out.reason) return NextResponse.json({ error: "Please choose the main reason." }, { status: 400 });
  await exdb.exitSurvey.update({ where: { id: s.id }, data: { answersJson: JSON.stringify(out), submittedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
