import { randomUUID } from "crypto";
import { prisma } from "./db";

// Faculty meals: the cafeteria / mess in charge puts up the menu for each day with prices and an order cut-off time;
// faculty order (or cancel) before the cut-off; the month's bill per person adds the orders up.

const fdb = prisma as unknown as Record<string, any>;
export const MEAL_HINT = "Faculty meals need prisma/migration_campus_ops.sql — run it in Supabase.";
export const MEAL_MANAGERS = ["CHAIRMAN", "FACILITIES_MANAGER", "FINANCE_OFFICER"];
export type Meal = { id: string; chairmanId: string; date: Date; item: string; price: number; cutoff: string | null };
export type Order = { id: string; mealId: string; userId: string; qty: number };

export async function menu(chairmanId: string, from: Date, days: number) {
  const meals = (await fdb.facultyMeal.findMany({ where: { chairmanId, date: { gte: from, lt: new Date(from.getTime() + days * 864e5) } }, orderBy: [{ date: "asc" }, { item: "asc" }] })) as Meal[];
  const orders = (await fdb.mealOrder.findMany({ where: { mealId: { in: meals.map((m) => m.id).concat("none") } } })) as Order[];
  return { meals, orders };
}
export async function addMeal(chairmanId: string, d: { date: Date; item: string; price: number; cutoff: string | null }, by: string) {
  await fdb.facultyMeal.create({ data: { id: randomUUID(), chairmanId, ...d, createdById: by, createdAt: new Date() } });
}
export async function removeMeal(chairmanId: string, id: string) {
  await fdb.mealOrder.deleteMany({ where: { mealId: id } });
  await fdb.facultyMeal.deleteMany({ where: { id, chairmanId } });
}
/** Karachi time "HH:MM" now and today's date. */
const pkNow = () => { const s = new Date(Date.now() + 5 * 3600e3).toISOString(); return { day: s.slice(0, 10), hm: s.slice(11, 16) }; };
export function open(m: Meal) { const n = pkNow(), d = m.date.toISOString().slice(0, 10); return d > n.day || (d === n.day && (!m.cutoff || n.hm < m.cutoff)); }

export async function order(chairmanId: string, mealId: string, userId: string, qty: number) {
  const m = (await fdb.facultyMeal.findFirst({ where: { id: mealId, chairmanId } })) as Meal | null;
  if (!m) throw new Error("Not found.");
  if (!open(m)) throw new Error(`Orders for this closed${m.cutoff ? ` at ${m.cutoff}` : ""}.`);
  if (qty <= 0) { await fdb.mealOrder.deleteMany({ where: { mealId, userId } }); return; }
  await fdb.mealOrder.upsert({ where: { mealId_userId: { mealId, userId } }, create: { id: randomUUID(), mealId, userId, qty, createdAt: new Date() }, update: { qty } });
}

/** The month's bill: per person, orders × price. */
export async function monthBill(chairmanId: string, year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1)), to = new Date(Date.UTC(year, month, 1));
  const meals = (await fdb.facultyMeal.findMany({ where: { chairmanId, date: { gte: from, lt: to } } })) as Meal[];
  const orders = (await fdb.mealOrder.findMany({ where: { mealId: { in: meals.map((m) => m.id).concat("none") } } })) as Order[];
  const price = new Map(meals.map((m) => [m.id, m.price]));
  const by = new Map<string, { items: number; amount: number }>();
  for (const o of orders) { const x = by.get(o.userId) || { items: 0, amount: 0 }; x.items += o.qty; x.amount += o.qty * (price.get(o.mealId) || 0); by.set(o.userId, x); }
  const names = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(by.keys()).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return Array.from(by.entries()).map(([id, x]) => ({ userId: id, name: names.get(id) || "—", ...x })).sort((a, b) => a.name.localeCompare(b.name));
}
