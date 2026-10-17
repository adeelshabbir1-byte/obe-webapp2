import { getAuthenticatedUser } from "./session";
import { checkLabSync, labsOfTheory } from "./labPlan";

/** After a change to a theory course's lecture plan: check each of its labs (capped so a save never waits long). */
export async function afterLecturePlanChange(theoryId: string) {
  try {
    const user = await getAuthenticatedUser().catch(() => null);
    const labs = await labsOfTheory(theoryId);
    const work = Promise.all(labs.map((l) => checkLabSync(l.id, user ? { id: user.id, name: user.name } : null).catch(() => {})));
    await Promise.race([work, new Promise((r) => setTimeout(r, 4000))]);
  } catch { /* never block a lecture plan save */ }
}

/** Wraps a lecture-plan route handler so a successful save checks the course's labs afterwards. */
export function withLabSync<C extends { params: { courseId: string } }>(h: (req: any, ctx: C) => Promise<Response>) {
  return async (req: any, ctx: C) => {
    const res = await h(req, ctx);
    if (res.ok) await afterLecturePlanChange(ctx.params.courseId);
    return res;
  };
}
