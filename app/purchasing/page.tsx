import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb, money } from "../../lib/erp";
import { P_STATUS, type PLine } from "../../lib/purchasing";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
type PR = { id: string; title: string; linesJson: string; total: number; status: string; requestedById: string; vendorId: string | null; poNumber: string | null; note: string | null; createdAt: Date };

// Purchasing: request → approve → order (PO) → receive → pay. Everyone can request and track their own requests.
export default async function PurchasingPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await erpAccess(user);
  if (!acc.chairmanId) redirect("/dashboard");
  const staff = acc.inventory || acc.approvePurchase;
  const all = ((await edb.purchaseRequest.findMany({ where: { chairmanId: acc.chairmanId, ...(staff ? {} : { requestedById: user.id }) }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => null)) as PR[] | null);
  if (all === null) return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><div className="err">Purchasing is not set up yet — run prisma/migration_erp.sql.</div></Shell>;
  const shown = searchParams.status ? all.filter((p) => p.status === searchParams.status) : all;
  const vendors = staff ? ((await edb.vendor.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { name: "asc" } })) as { id: string; name: string }[]) : [];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.map((p) => p.requestedById))) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const vName = new Map(vendors.map((v) => [v.id, v.name]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Purchasing</h1>
      <p className="small-note">Request → Finance / Institute Head approve → store orders from a vendor (purchase order) → goods received into stock → Finance pays the vendor. Each step posts to the accounts.</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Link href="/purchasing" className="act">All {all.length}</Link>
        {Object.entries(P_STATUS).map(([k, v]) => <Link key={k} href={`/purchasing?status=${k}`} className="act" style={{ fontWeight: searchParams.status === k ? 700 : 400 }}>{v} {all.filter((p) => p.status === k).length}</Link>)}
      </div>
      <div className="card">
        <ActionForm url="/api/purchasing" fixed={{ action: "request" }} submit="Send request" collapsed openLabel="New purchase request"
          fields={[{ name: "title", label: "What for (e.g. Networking lab consumables)", width: 320 }, { name: "lines", label: "Items — one per line: name | qty | unit cost | stock code (optional)", type: "textarea" }, { name: "note", label: "Justification", type: "textarea" }]} />
      </div>
      {shown.map((p) => {
        const lines = JSON.parse(p.linesJson) as PLine[];
        return (
          <div key={p.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div><b>{p.title}</b> <span className="small-note">{p.poNumber ? `${p.poNumber} · ` : ""}{people.get(p.requestedById) || ""} · {p.createdAt.toISOString().slice(0, 10)}{p.vendorId ? ` · ${vName.get(p.vendorId) || ""}` : ""}</span></div>
              <div><b>{money(p.total)}</b> · <span style={{ color: p.status === "REJECTED" ? "#B3261E" : p.status === "PAID" ? "#1F5E36" : undefined }}>{P_STATUS[p.status] || p.status}</span></div>
            </div>
            <div style={{ fontSize: 12.5, margin: "6px 0" }}>{lines.map((l, i) => <div key={i}>{l.name} × {l.qty} @ {money(l.unitCost)}{l.code ? <span className="small-note"> · stock {l.code}</span> : null}</div>)}</div>
            {p.note && <div className="small-note">{p.note}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
              {p.status === "REQUESTED" && acc.approvePurchase && <><ActionButton url="/api/purchasing" body={{ action: "decide", id: p.id, approve: true }} label="Approve" /><ActionButton url="/api/purchasing" body={{ action: "decide", id: p.id, approve: false }} label="Reject" className="btn btn-secondary btn-sm" askNote="Reason" /></>}
              {p.status === "REQUESTED" && p.requestedById === user.id && <ActionButton url="/api/purchasing" body={{ action: "cancel", id: p.id }} label="Withdraw" className="btn btn-secondary btn-sm" confirmText="Withdraw this request?" />}
              {p.status === "APPROVED" && acc.inventory && (vendors.length ? <ActionForm url="/api/purchasing" fixed={{ action: "order", id: p.id }} submit="Issue purchase order" initial={{ vendorId: vendors[0].id }} fields={[{ name: "vendorId", label: "Vendor", type: "select", options: vendors.map((v) => [v.id, v.name] as [string, string]) }]} /> : <span className="small-note">Add a vendor under <Link href="/inventory">Inventory</Link> to order.</span>)}
              {p.poNumber && <Link href={`/purchasing/po/${p.id}`} className="act">Print PO</Link>}
              {p.status === "ORDERED" && acc.inventory && <ActionButton url="/api/purchasing" body={{ action: "receive", id: p.id }} label="Goods received" confirmText="Mark all items received into stock?" />}
              {p.status === "RECEIVED" && acc.finance && <ActionButton url="/api/purchasing" body={{ action: "pay", id: p.id }} label="Pay vendor (bank)" confirmText={`Pay ${money(p.total)} from bank?`} />}
            </div>
          </div>
        );
      })}
      {!shown.length && <p className="small-note">No purchase requests.</p>}
    </Shell>
  );
}
