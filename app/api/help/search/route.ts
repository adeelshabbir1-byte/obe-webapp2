import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { articlesFor, helpViewer } from "../../../../lib/help/access";
import { searchArticles, suggestFor } from "../../../../lib/help/search";
import { helpAiCredentials } from "../../../../lib/help/rerank";
import { forAudience, type HelpArticle } from "../../../../lib/help/types";
import { toCard } from "../../../../lib/help/cards";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

const card = toCard;

// GET ?q=&path=&audience=student — search the help center as the signed-in person (staff role or student).
// Without q it returns the suggestions for the page they are on.
async function GET_handler(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const viewer = await helpViewer(sp.get("audience") === "student" ? "student" : "staff");
  if (!viewer) return NextResponse.json({ error: "Sign in to use help." }, { status: 401 });
  const q = (sp.get("q") || "").trim().slice(0, 200);
  const path = (sp.get("path") || "").slice(0, 200);
  const all = await articlesFor(viewer.chairmanId);
  const ctx = { role: viewer.role, path };

  if (sp.get("key")) {
    const a = all.find((x) => x.key === sp.get("key"));
    const visible = a && forAudience(a, viewer.role) ? a : null;
    if (!visible) return NextResponse.json({ error: "not found" }, { status: 404 });
    const related = (visible.related || []).map((k) => all.find((x) => x.key === k)).filter((x): x is HelpArticle => !!x).map((x) => ({ key: x.key, title: x.title }));
    return NextResponse.json({ article: card(visible), related });
  }
  if (!q) return NextResponse.json({ results: [], suggestions: suggestFor(all, ctx).map(card) });

  const hits = searchArticles(all, q, ctx);
  // Searches that found nothing tell the Institute Head which answers are missing. No person is recorded.
  if (!hits.length && q.length >= 3) {
    await prisma.helpSearchLog.create({ data: { chairmanId: viewer.chairmanId, role: viewer.role, query: q.toLowerCase(), results: 0, page: path || null } }).catch(() => null);
  }
  const ai = hits.length >= 2 && !!(await helpAiCredentials(viewer.chairmanId));
  return NextResponse.json({ results: hits.map((h) => ({ ...card(h.article), matched: h.matched })), aiAvailable: ai });
}
export const GET = withErrors(GET_handler);
