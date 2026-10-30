import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { createFeedback } from "../../../lib/feedback";
import { withErrors } from "../../../lib/apiHandler";

// Any signed-in staff user sends feedback to the platform owner.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await createFeedback(user, { category: String(b.category || ""), title: String(b.title || ""), body: String(b.body || ""), pageUrl: b.pageUrl ? String(b.pageUrl) : null });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "Feedback can't be saved yet — the feedback table is not in the database (run prisma/migration_oct2026_features.sql)." }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
