import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { erpAccess, edb, money } from "../../../../lib/erp";
import type { PLine } from "../../../../lib/purchasing";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";

// Printable purchase order.
export default async function PoPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const acc = await erpAccess(user);
  if (!acc.inventory && !acc.approvePurchase) redirect("/purchasing");
  const p = (await edb.purchaseRequest.findFirst({ where: { id: params.id, chairmanId: acc.chairmanId } })) as { title: string; linesJson: string; total: number; poNumber: string | null; vendorId: string | null; updatedAt: Date } | null;
  if (!p || !p.poNumber) notFound();
  const v = p.vendorId ? ((await edb.vendor.findFirst({ where: { id: p.vendorId } })) as { name: string; phone: string | null; email: string | null; ntn: string | null; address: string | null } | null) : null;
  const head = await prisma.user.findUnique({ where: { id: acc.chairmanId }, select: { instituteName: true } });
  const lines = JSON.parse(p.linesJson) as PLine[];
  return (
    <main style={{ maxWidth: 760, margin: "24px auto", padding: 20, fontSize: 14 }}>
      <div className="no-print" style={{ marginBottom: 10 }}><PrintButton /></div>
      <h1 style={{ fontSize: 20, margin: 0 }}>{head?.instituteName || "Institute"}</h1>
      <h2 style={{ fontSize: 16 }}>Purchase Order {p.poNumber}</h2>
      <p>Date: {p.updatedAt.toISOString().slice(0, 10)}<br />Subject: {p.title}</p>
      {v && <p>To: <b>{v.name}</b><br />{[v.address, v.phone, v.email, v.ntn && `NTN ${v.ntn}`].filter(Boolean).join(" · ")}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }} border={1} cellPadding={6}>
        <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.name}</td><td>{l.qty}</td><td>{money(l.unitCost)}</td><td>{money(l.qty * l.unitCost)}</td></tr>)}
          <tr><td colSpan={4} style={{ textAlign: "right" }}><b>Total</b></td><td><b>{money(p.total)}</b></td></tr></tbody>
      </table>
      <p style={{ marginTop: 50, display: "flex", justifyContent: "space-between" }}><span>____________________<br />Store / Procurement</span><span>____________________<br />Finance</span></p>
    </main>
  );
}
