import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getSignedInUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { adb, CATEGORIES, STATUS, type Asset } from "../../../lib/assets";
import AssetFaultForm from "../../../components/AssetFaultForm";

export const dynamic = "force-dynamic";

// Public page behind the QR label on a machine: what it is, and a form to report a fault (no sign-in needed).
export default async function AssetPage({ params }: { params: { id: string } }) {
  const a = (await adb.asset.findUnique({ where: { id: params.id } }).catch(() => null)) as Asset | null;
  if (!a) notFound();
  const lab = a.labId ? await prisma.labInfo.findUnique({ where: { id: a.labId }, select: { name: true } }) : null;
  const open = await adb.assetFault.count({ where: { assetId: a.id, status: { in: ["OPEN", "REPAIRING"] } } }).catch(() => 0);
  const signedIn = !!(await getSignedInUser().catch(() => null)) || !!(await getAuthenticatedStudent().catch(() => null));
  return (
    <main style={{ minHeight: "100vh", background: "#F7F2F1", padding: "28px 16px", fontFamily: "Arial, sans-serif", color: "#221" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", background: "#fff", borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, color: "#7A1F2B", fontWeight: 700 }}>OBEHUB · EQUIPMENT</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 2px" }}>{a.item}</h1>
        <p style={{ margin: "0 0 12px", color: "#555" }}>{[CATEGORIES[a.category], a.makeModel, `tag ${a.assetTag}`, lab?.name || a.room].filter(Boolean).join(" · ")}</p>
        <p style={{ margin: "0 0 14px", fontWeight: 700, color: a.status === "WORKING" ? "#1E6B3A" : "#B3261E" }}>{STATUS[a.status]}{open ? ` — ${open} fault report(s) being looked at` : ""}</p>
        {a.status === "CONDEMNED" ? <p>This item has been written off.</p> : <AssetFaultForm assetId={a.id} signedIn={signedIn} />}
      </div>
    </main>
  );
}
