import { CATEGORIES, forAudience, type HelpArticle } from "./types";

/** What the help screens get for an article (plain data, safe to send to the browser). */
export const toCard = (a: HelpArticle) => ({
  key: a.key, kind: a.kind, category: a.category, title: a.title, summary: a.summary, steps: a.steps || [], who: a.who || "",
  affects: a.affects || "", href: a.href || "", related: a.related || [], source: a.source,
});

/** The articles a viewer may read, grouped in topic order (each topic keeps its own order). */
export function visibleCards(all: HelpArticle[], role: string) {
  const order = new Map(CATEGORIES.map((c, i) => [c.key as string, i]));
  return all
    .filter((a) => forAudience(a, role))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (order.get(x.a.category) ?? 99) - (order.get(y.a.category) ?? 99) || x.i - y.i)
    .map(({ a }) => toCard(a));
}
