import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import PrintButton from "../../../components/PrintButton";
import { adb, assetScope, labsIn, type Asset } from "../../../lib/assets";
import { qrSvg, appBaseFrom, requestOrigin } from "../../../lib/signoff";

export const dynamic = "force-dynamic";

// A sheet of QR labels for a lab: each opens the item's page, where anyone can report a fault.
export default async function AssetLabels({ searchParams }: { searchParams: { lab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const sc = await assetScope(user as never);
  if (!sc) redirect("/dashboard");
  const labs = await labsIn(sc.chairmanId, sc.departmentIds);
  const lab = labs.find((l) => l.id === searchParams.lab);
  if (!lab) redirect("/assets");
  const items = (await adb.asset.findMany({ where: { labId: lab.id, status: { not: "CONDEMNED" } }, orderBy: { assetTag: "asc" } }).catch(() => [])) as Asset[];
  const inst = await prisma.user.findUnique({ where: { id: sc.chairmanId }, select: { instituteName: true } });
  const o = requestOrigin(); const base = appBaseFrom(o.host, o.proto);
  return (
    <div style={{ padding: 16, fontFamily: "Arial, sans-serif", background: "#fff" }}>
      <div className="no-print" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}><b>{lab.name}: {items.length} labels</b><PrintButton label="Print labels" /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
        {items.map((a) => (
          <div key={a.id} style={{ border: "1px dashed #999", borderRadius: 6, padding: 8, display: "flex", gap: 8, alignItems: "center", breakInside: "avoid" }}>
            <span dangerouslySetInnerHTML={{ __html: qrSvg(`${base}/asset/${a.id}`, 74) }} />
            <div style={{ fontSize: 10.5, lineHeight: 1.3 }}><b style={{ fontSize: 12 }}>{a.assetTag}</b><br />{a.item}<br />{inst?.instituteName || ""}<br /><i>Scan to report a fault</i></div>
          </div>
        ))}
      </div>
    </div>
  );
}
