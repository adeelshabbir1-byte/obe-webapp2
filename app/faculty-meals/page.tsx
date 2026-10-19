import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { menu, monthBill, open, MEAL_HINT, MEAL_MANAGERS } from "../../lib/facultyMeals";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faculty Meals" };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function FacultyMealsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const manage = MEAL_MANAGERS.includes(user.role);
  const today = new Date(iso(new Date()) + "T00:00:00Z");
  const ym = iso(today).slice(0, 7);
  let data: Awaited<ReturnType<typeof menu>> | null = null;
  try { data = await menu(chairmanId, today, 7); } catch { data = null; }
  const bill = data ? await monthBill(chairmanId, today.getUTCFullYear(), today.getUTCMonth() + 1).catch(() => []) : [];
  const mine = bill.find((b) => b.userId === user.id);
  const days = Array.from(new Set((data?.meals || []).map((m) => iso(m.date))));
  const url = "/api/faculty-meals";

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Meals</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Order from the faculty menu before the cut-off time; your month&apos;s bill adds up here. Food for visits and events is arranged in the visit-day checklist.</p>
      {!data && <div className="err">{MEAL_HINT}</div>}
      {data && <div className="card"><b>My bill for {ym}:</b> {mine ? `${mine.items} item(s), Rs ${mine.amount.toLocaleString()}` : "nothing ordered yet"}</div>}
      {data && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Menu — next 7 days</h3>
          {days.length === 0 && <p className="small-note">No menu put up yet.</p>}
          {days.map((d) => (
            <div key={d} style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 13 }}>{new Date(`${d}T00:00:00Z`).toDateString()}</b>
              <table style={{ fontSize: 12.5, marginTop: 4 }}><tbody>{data!.meals.filter((m) => iso(m.date) === d).map((m) => {
                const my = data!.orders.find((o) => o.mealId === m.id && o.userId === user.id);
                const count = data!.orders.filter((o) => o.mealId === m.id).reduce((a, o) => a + o.qty, 0);
                return (
                  <tr key={m.id}>
                    <td style={{ width: "40%" }}>{m.item}</td><td>Rs {m.price}</td><td className="small-note">{m.cutoff ? `order by ${m.cutoff}` : ""}</td>
                    <td>{open(m) ? (my ? <span>Ordered ×{my.qty} <ActionButton url={url} body={{ action: "order", mealId: m.id, qty: 0 }} label="Cancel" className="btn btn-ghost btn-sm" /></span> : <ActionButton url={url} body={{ action: "order", mealId: m.id, qty: 1 }} label="Order" />) : my ? `Ordered ×${my.qty}` : "Closed"}</td>
                    {manage && <td className="small-note">{count} ordered <ActionButton url={url} body={{ action: "remove", id: m.id }} label="Remove" className="btn btn-ghost btn-sm" confirmText="Remove this item and its orders?" /></td>}
                  </tr>
                );
              })}</tbody></table>
            </div>
          ))}
          {manage && <ActionForm url={url} fixed={{ action: "add" }} collapsed openLabel="+ Add to the menu" submit="Add" initial={{ date: iso(today), cutoff: "11:00" }} fields={[{ name: "date", label: "Date", type: "date" }, { name: "item", label: "Item", width: 220 }, { name: "price", label: "Price (Rs)", type: "number", width: 90 }, { name: "cutoff", label: "Order by", width: 70 }]} />}
        </div>
      )}
      {data && manage && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Bills for {ym} <a className="small-note" href={`${url}?month=${ym}`}>Download CSV</a></h3>
          {bill.length === 0 ? <p className="small-note">No orders this month.</p> : (
            <table style={{ fontSize: 12.5 }}><thead><tr><th>Name</th><th style={{ textAlign: "center" }}>Items</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>{bill.map((b) => <tr key={b.userId}><td>{b.name}</td><td style={{ textAlign: "center" }}>{b.items}</td><td style={{ textAlign: "right" }}>Rs {b.amount.toLocaleString()}</td></tr>)}
                <tr><td><b>Total</b></td><td style={{ textAlign: "center" }}><b>{bill.reduce((a, b) => a + b.items, 0)}</b></td><td style={{ textAlign: "right" }}><b>Rs {bill.reduce((a, b) => a + b.amount, 0).toLocaleString()}</b></td></tr></tbody>
            </table>
          )}
        </div>
      )}
    </Shell>
  );
}
