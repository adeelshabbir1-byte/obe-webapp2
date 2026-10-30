import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { addMeal, removeMeal, order, monthBill, MEAL_HINT, MEAL_MANAGERS } from "../../../lib/facultyMeals";
import { withErrors } from "../../../lib/apiHandler";

const day = (s: unknown) => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(`${s}T00:00:00Z`) : null);

// GET ?month=YYYY-MM — the month's bill as CSV (managers). POST { action: add | remove | order }
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !MEAL_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [y, m] = String(req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const bill = await monthBill(await chairmanIdFor(user), y, m);
  const csv = ["Name,Items,Amount (Rs)", ...bill.map((b) => `"${b.name.replace(/"/g, '""')}",${b.items},${b.amount}`), `Total,${bill.reduce((a, b) => a + b.items, 0)},${bill.reduce((a, b) => a + b.amount, 0)}`].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="faculty-meals-${y}-${String(m).padStart(2, "0")}.csv"` } });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "order") { await order(chairmanId, String(b.mealId), user.id, Math.max(0, Math.min(10, Math.round(Number(b.qty) || 0)))); return NextResponse.json({ ok: true }); }
    if (!MEAL_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (b.action === "add") {
      const date = day(b.date), item = String(b.item || "").trim().slice(0, 160);
      if (!date || !item) return NextResponse.json({ error: "Give the date and the item." }, { status: 400 });
      await addMeal(chairmanId, { date, item, price: Math.max(0, Number(b.price) || 0), cutoff: /^\d{1,2}:\d{2}$/.test(String(b.cutoff || "").trim()) ? String(b.cutoff).trim().padStart(5, "0") : null }, user.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") { await removeMeal(chairmanId, String(b.id)); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: /closed|Not found/.test(m) ? m : MEAL_HINT }, { status: 400 });
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
