import { NextRequest, NextResponse } from "next/server";
import { articlesFor, helpViewer } from "../../../../lib/help/access";
import { searchArticles } from "../../../../lib/help/search";
import { rerankWithAi } from "../../../../lib/help/rerank";

export const dynamic = "force-dynamic";

// POST { q, audience } — the AI's choice among the local results, best first. The candidates are worked out again
// here (never taken from the browser), so the model only ever sees articles this person may read.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const viewer = await helpViewer(b.audience === "student" ? "student" : "staff");
  if (!viewer) return NextResponse.json({ error: "Sign in to use help." }, { status: 401 });
  const q = String(b.q || "").trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json({ keys: null });
  const all = await articlesFor(viewer.chairmanId);
  const hits = searchArticles(all, q, { role: viewer.role, path: String(b.path || "").slice(0, 200) }, 12);
  const keys = await rerankWithAi({ chairmanId: viewer.chairmanId, viewerKey: `${viewer.kind}:${viewer.id}`, role: viewer.role, question: q, candidates: hits.map((h) => h.article) });
  return NextResponse.json({ keys });
}
