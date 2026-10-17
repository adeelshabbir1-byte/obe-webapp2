import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb, money } from "../../lib/erp";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
type Item = { id: string; code: string; name: string; category: string | null; unit: string; location: string | null; qty: number; reorderLevel: number; unitCost: number };
type Vendor = { id: string; name: string; phone: string | null; email: string | null; ntn: string | null };

// Store / inventory: stock list with low-stock alerts, issue and receive, stock counts, vendors.
export default async function InventoryPage({ searchParams }: { searchParams: { q?: string; low?: string; item?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await erpAccess(user);
  if (!acc.inventory) redirect("/purchasing");
  const items = ((await edb.stockItem.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: [{ category: "asc" }, { name: "asc" }] }).catch(() => null)) as Item[] | null);
  if (items === null) return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><div className="err">Inventory is not set up yet — run prisma/migration_erp.sql.</div></Shell>;
  const vendors = (await edb.vendor.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { name: "asc" } })) as Vendor[];
  const q = (searchParams.q || "").toLowerCase();
  const low = items.filter((i) => i.qty <= i.reorderLevel && i.reorderLevel > 0);
  const shown = items.filter((i) => (!searchParams.low || (i.qty <= i.reorderLevel && i.reorderLevel > 0)) && (!q || `${i.code} ${i.name} ${i.category} ${i.location}`.toLowerCase().includes(q)));
  const sel = searchParams.item ? items.find((i) => i.id === searchParams.item) : null;
  const moves = sel ? ((await edb.stockMove.findMany({ where: { itemId: sel.id }, orderBy: { at: "desc" }, take: 40 })) as { qty: number; kind: string; ref: string | null; at: Date }[]) : [];
  const value = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Store &amp; Inventory</h1>
      <p className="small-note">Lab consumables, stationery, exam material, furniture spares. Purchases arrive here when received under <Link href="/purchasing">Purchasing</Link>; issues are expensed to Supplies at average cost.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        {[["Items", String(items.length)], ["Stock value", money(value)], ["Low stock", String(low.length)], ["Vendors", String(vendors.length)]].map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 20, fontWeight: 700, color: l === "Low stock" && low.length ? "#B3261E" : undefined }}>{v}</div></div>)}
      </div>
      <div className="card">
        <ActionForm url="/api/inventory" fixed={{ action: "addItem" }} submit="Save item" collapsed openLabel="Add / update a stock item" initial={{ unit: "pcs" }}
          fields={[{ name: "code", label: "Code", width: 100 }, { name: "name", label: "Name", width: 200 }, { name: "category", label: "Category", width: 130 }, { name: "unit", label: "Unit", width: 70 }, { name: "location", label: "Location / store", width: 140 }, { name: "reorderLevel", label: "Reorder at", type: "number", width: 80 }, { name: "unitCost", label: "Unit cost", type: "number", width: 90 }]} />
        <ActionForm url="/api/inventory" fixed={{ action: "addVendor" }} submit="Add vendor" collapsed openLabel="Add a vendor"
          fields={[{ name: "name", label: "Vendor", width: 200 }, { name: "phone", label: "Phone", width: 120 }, { name: "email", label: "Email", width: 170 }, { name: "ntn", label: "NTN", width: 100 }, { name: "address", label: "Address", width: 220 }]} />
      </div>
      {sel && (
        <div className="card" style={{ borderLeft: "4px solid #1B6CA8" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>{sel.code} · {sel.name}</h3><Link href="/inventory">Close</Link></div>
          <p className="small-note">In stock {sel.qty} {sel.unit} · avg cost {money(sel.unitCost)} · {sel.location || "no location"}</p>
          <ActionForm url="/api/inventory" fixed={{ action: "move", itemId: sel.id }} submit="Record" initial={{ kind: "OUT" }}
            fields={[{ name: "kind", label: "Move", type: "select", options: [["OUT", "Issue to department / lab"], ["IN", "Receive (donation / return)"], ["ADJUST", "Stock count (set qty)"]] }, { name: "qty", label: "Qty", type: "number", width: 80 }, { name: "ref", label: "To whom / reference", width: 240 }]} />
          <div style={{ fontSize: 12.5, marginTop: 6 }}>{moves.map((m, i) => <div key={i}><span className="small-note">{m.at.toISOString().slice(0, 10)}</span> {m.kind.toLowerCase()} <b>{m.qty > 0 ? "+" : ""}{m.qty}</b> {m.ref || ""}</div>)}</div>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <form style={{ marginBottom: 8 }}><input name="q" defaultValue={searchParams.q || ""} placeholder="Search code, name, category" style={{ width: 260 }} /> <button className="btn btn-secondary btn-sm">Find</button> <Link href="/inventory?low=1" className="act">Low stock only</Link></form>
        <table><thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Location</th><th>Qty</th><th>Reorder</th><th>Value</th></tr></thead>
          <tbody>{shown.map((i) => <tr key={i.id} style={{ background: i.reorderLevel > 0 && i.qty <= i.reorderLevel ? "#FDECEA" : undefined }}><td>{i.code}</td><td><Link href={`/inventory?item=${i.id}`}>{i.name}</Link></td><td>{i.category || "—"}</td><td>{i.location || "—"}</td><td>{i.qty} {i.unit}</td><td>{i.reorderLevel || "—"}</td><td>{money(i.qty * i.unitCost)}</td></tr>)}</tbody></table>
        {!shown.length && <p className="small-note">No items.</p>}
      </div>
      {vendors.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Vendors</h3><div style={{ fontSize: 13 }}>{vendors.map((v) => <div key={v.id}><b>{v.name}</b> <span className="small-note">{[v.phone, v.email, v.ntn && `NTN ${v.ntn}`].filter(Boolean).join(" · ")}</span></div>)}</div></div>}
    </Shell>
  );
}
