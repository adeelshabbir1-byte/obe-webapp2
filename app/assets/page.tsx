import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { adb, ASSET_HINT, CATEGORIES, STATUS, assetScope, labsIn, assetReport, type Asset, type Fault } from "../../lib/assets";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TABS: [string, string][] = [["register", "Register"], ["faults", "Faults & repairs"], ["verify", "Stock-taking"], ["reports", "Reports"]];
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const catOpts = Object.entries(CATEGORIES) as [string, string][];
const COLOUR: Record<string, string> = { WORKING: "#1E6B3A", FAULTY: "#B3261E", UNDER_REPAIR: "#B45309", CONDEMNED: "#777" };

// Lab equipment and assets: the register per lab or room (with QR labels), faults and repairs, the yearly
// stock-taking, write-offs and reports.
export default async function AssetsPage({ searchParams }: { searchParams: { tab?: string; lab?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const sc = await assetScope(user as never);
  if (!sc) redirect("/dashboard");
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "register";
  const labs = await labsIn(sc.chairmanId, sc.departmentIds);
  const lab = labs.find((l) => l.id === searchParams.lab) || null;
  const labIds = lab ? [lab.id] : sc.departmentIds ? labs.map((l) => l.id) : null;
  const q = (searchParams.q || "").trim();
  let missing = false, items: Asset[] = [], faults: Fault[] = [], verifications: { id: string; labId: string | null; room: string | null; year: number; foundIds: string; missingIds: string; note: string | null; verifiedById: string; verifiedAt: Date }[] = [], pendingCondemn: { assetId: string }[] = [];
  try {
    items = await adb.asset.findMany({ where: { chairmanId: sc.chairmanId, ...(labIds ? { labId: { in: labIds.concat(["none"]) } } : {}), ...(q ? { OR: [{ item: { contains: q, mode: "insensitive" } }, { assetTag: { contains: q, mode: "insensitive" } }, { serialNo: { contains: q, mode: "insensitive" } }, { makeModel: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: [{ labId: "asc" }, { assetTag: "asc" }], take: 500 });
    if (tab === "faults") faults = await adb.assetFault.findMany({ where: { chairmanId: sc.chairmanId, assetId: { in: items.map((i) => i.id).concat(["none"]) } }, orderBy: [{ status: "asc" }, { reportedAt: "desc" }], take: 200 });
    if (tab === "verify") verifications = await adb.assetVerification.findMany({ where: { chairmanId: sc.chairmanId, ...(labIds ? { labId: { in: labIds.concat(["none"]) } } : {}) }, orderBy: { verifiedAt: "desc" }, take: 50 });
    pendingCondemn = await adb.assetCondemnation.findMany({ where: { chairmanId: sc.chairmanId, status: "PENDING" }, select: { assetId: true } });
  } catch { missing = true; }
  const rep = tab === "reports" && !missing ? await assetReport(sc.chairmanId, labIds) : null;
  const labName = new Map(labs.map((l) => [l.id, l.name]));
  const where = (a: Asset) => (a.labId ? labName.get(a.labId) || "Lab" : a.room || "—");
  const byId = new Map(items.map((i) => [i.id, i]));
  const people = new Map((await prisma.user.findMany({ where: { id: { in: verifications.map((v) => v.verifiedById).concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const qs = (t: string) => `/assets?tab=${t}${lab ? `&lab=${lab.id}` : ""}`;
  const assetFields = [
    { name: "labId", label: "Lab", type: "select" as const, options: [["", "— another room —"] as [string, string], ...labs.map((l) => [l.id, l.name] as [string, string])] }, { name: "room", label: "Room (if not a lab)", type: "text" as const },
    { name: "category", label: "Kind", type: "select" as const, options: catOpts }, { name: "item", label: "Item", type: "text" as const }, { name: "makeModel", label: "Make / model", type: "text" as const }, { name: "serialNo", label: "Serial number", type: "text" as const },
    { name: "processor", label: "Processor (computers)", type: "text" as const }, { name: "ramGb", label: "RAM (GB)", type: "number" as const }, { name: "storage", label: "Storage", type: "text" as const }, { name: "gpu", label: "GPU", type: "text" as const }, { name: "os", label: "Operating system", type: "text" as const },
    { name: "spec", label: "Other specification", type: "text" as const }, { name: "purchaseDate", label: "Purchased on", type: "date" as const }, { name: "cost", label: "Cost (Rs, each)", type: "number" as const }, { name: "supplier", label: "Supplier", type: "text" as const }, { name: "warrantyEnd", label: "Warranty ends", type: "date" as const },
  ];

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Lab Equipment &amp; Assets</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>Every item with its QR asset tag. Anyone in the lab can report a fault by scanning the label. Once a lab&apos;s yearly count is signed off, its computer figures (installed, working, specifications) come from this register — the figures the readiness checks and the SAR use.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{ASSET_HINT}</p></div>}
      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        {TABS.map(([k, l]) => <Link key={k} href={qs(k)} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>)}
        <form method="get" style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          <input type="hidden" name="tab" value={tab} />
          <select name="lab" className="input" defaultValue={lab?.id || ""}><option value="">All labs and rooms</option>{labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          {tab === "register" && <input name="q" className="input" defaultValue={q} placeholder="item, tag, serial" style={{ width: 150 }} />}
          <button className="btn btn-secondary btn-sm">Show</button>
        </form>
      </div>

      {tab === "register" && !missing && (
        <>
          {sc.canEdit && (
            <div className="card no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ActionForm url="/api/assets" fixed={{ action: "save" }} collapsed openLabel="Add items…" submit="Add" initial={{ labId: lab?.id || "", category: "COMPUTER", quantity: 1 }} fields={[...assetFields, { name: "quantity", label: "How many identical items (each gets its own tag)", type: "number" as const }]} />
              {lab && <a className="btn btn-secondary btn-sm" href={`/assets/labels?lab=${lab.id}`} target="_blank" rel="noreferrer">Print QR labels for {lab.name}</a>}
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            {items.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No items registered{lab ? ` in ${lab.name}` : ""} yet.</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Tag</th><th>Item</th><th>Where</th><th>Specification</th><th>Bought</th><th>Warranty</th><th>Status</th><th></th></tr></thead>
                <tbody>{items.map((a) => (
                  <tr key={a.id}>
                    <td><a href={`/asset/${a.id}`} target="_blank" rel="noreferrer"><b>{a.assetTag}</b></a></td>
                    <td>{a.item}<div className="small-note" style={{ margin: 0 }}>{[CATEGORIES[a.category], a.makeModel, a.serialNo ? `S/N ${a.serialNo}` : ""].filter(Boolean).join(" · ")}</div></td>
                    <td>{where(a)}</td>
                    <td style={{ fontSize: 12 }}>{[a.processor, a.ramGb ? `${a.ramGb} GB RAM` : "", a.storage, a.gpu, a.os, a.spec].filter(Boolean).join(", ") || "—"}</td>
                    <td>{day(a.purchaseDate)}{a.cost ? <div className="small-note" style={{ margin: 0 }}>Rs {a.cost.toLocaleString("en-PK")}</div> : null}</td>
                    <td style={{ color: a.warrantyEnd && new Date(a.warrantyEnd) < new Date() ? "#B3261E" : undefined }}>{day(a.warrantyEnd)}</td>
                    <td style={{ color: COLOUR[a.status], fontWeight: 700 }}>{STATUS[a.status]}{pendingCondemn.some((c) => c.assetId === a.id) ? <div className="small-note" style={{ margin: 0 }}>write-off waiting for approval</div> : null}</td>
                    <td>{sc.canEdit && a.status !== "CONDEMNED" && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <ActionForm url="/api/assets" fixed={{ action: "save", id: a.id }} collapsed openLabel="Edit" submit="Save" initial={{ ...a, labId: a.labId || "", purchaseDate: a.purchaseDate ? new Date(a.purchaseDate).toISOString().slice(0, 10) : "", warrantyEnd: a.warrantyEnd ? new Date(a.warrantyEnd).toISOString().slice(0, 10) : "" }} fields={assetFields} />
                        {!pendingCondemn.some((c) => c.assetId === a.id) && <ActionForm url="/api/assets" fixed={{ action: "condemn", assetId: a.id }} collapsed openLabel="Write off…" submit="Ask for approval" fields={[{ name: "reason", label: "Why (beyond repair, obsolete …)", type: "text" }, { name: "committeeNote", label: "Condemnation committee's finding (date, members)", type: "textarea" }]} />}
                      </div>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "faults" && !missing && (
        <div className="card" style={{ overflowX: "auto" }}>
          {faults.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No faults reported.</p> : (
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Item</th><th>Fault</th><th>Repair log</th><th>Status</th><th></th></tr></thead>
              <tbody>{faults.map((f) => { const a = byId.get(f.assetId); const steps = JSON.parse(f.stepsJson || "[]") as { at: string; by: string; text: string }[]; const repeats = faults.filter((x) => x.assetId === f.assetId).length; return (
                <tr key={f.id}>
                  <td><b>{a?.assetTag}</b> {a?.item}<div className="small-note" style={{ margin: 0 }}>{a ? where(a) : ""}</div>{repeats >= 3 && <div style={{ color: "#B3261E", fontSize: 11.5, fontWeight: 700 }}>repeated faults ({repeats})</div>}</td>
                  <td>{f.description}<div className="small-note" style={{ margin: 0 }}>{f.reportedBy} · {day(f.reportedAt)}</div></td>
                  <td style={{ fontSize: 12 }}>{steps.length ? steps.map((s, i) => <div key={i}>{day(s.at)} — {s.text} <i>({s.by})</i></div>) : "—"}{f.cost ? <div>Cost Rs {f.cost.toLocaleString("en-PK")}</div> : null}</td>
                  <td style={{ fontWeight: 700, color: f.status === "FIXED" ? "#1E6B3A" : f.status === "CONDEMNED" ? "#777" : "#B3261E" }}>{f.status.toLowerCase()}{f.fixedAt ? <div className="small-note" style={{ margin: 0 }}>{day(f.fixedAt)}</div> : null}</td>
                  <td>{sc.canEdit && ["OPEN", "REPAIRING"].includes(f.status) && <ActionForm url="/api/assets" fixed={{ action: "repair", faultId: f.id }} collapsed openLabel="Log repair…" submit="Save" initial={{ status: "REPAIRING" }} fields={[{ name: "text", label: "What was done", type: "text" }, { name: "status", label: "Now", type: "select", options: [["REPAIRING", "Being repaired"], ["FIXED", "Fixed — working again"]] }, { name: "cost", label: "Cost so far (Rs)", type: "number" }]} />}</td>
                </tr>
              ); })}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === "verify" && !missing && (
        <>
          {sc.canEdit && (
            <div className="card">
              <p className="small-note" style={{ marginTop: 0 }}>Count the items in a lab: scan or type the tags you found (or leave the box empty if everything is there) and sign off. Items not found are listed as missing.</p>
              <ActionForm url="/api/assets" fixed={{ action: "verify" }} submit="Sign off the count" initial={{ labId: lab?.id || labs[0]?.id || "" }} fields={[{ name: "labId", label: "Lab", type: "select", options: labs.map((l) => [l.id, l.name] as [string, string]) }, { name: "foundTags", label: "Tags found (empty = all present)", type: "textarea" }, { name: "note", label: "Note", type: "text" }]} />
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            {verifications.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No counts signed off yet — until one is, the lab figures typed on Lab facilities are kept.</p> : (
              <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Lab</th><th>Year</th><th>Found</th><th>Missing</th><th>Signed off by</th><th>Note</th></tr></thead>
                <tbody>{verifications.map((v) => { const miss = JSON.parse(v.missingIds) as string[]; return <tr key={v.id}><td>{labName.get(v.labId || "") || v.room}</td><td>{v.year}</td><td>{(JSON.parse(v.foundIds) as string[]).length}</td><td style={{ color: miss.length ? "#B3261E" : undefined }}>{miss.length ? miss.map((id) => byId.get(id)?.assetTag || "?").join(", ") : "none"}</td><td>{people.get(v.verifiedById) || "—"}<div className="small-note" style={{ margin: 0 }}>{day(v.verifiedAt)}</div></td><td>{v.note || ""}</td></tr>; })}</tbody></table>
            )}
          </div>
        </>
      )}

      {rep && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {([["Items", rep.items], ["Value", `Rs ${rep.value.toLocaleString("en-PK")}`], ["Average age", rep.avgAge === null ? "—" : `${rep.avgAge} years`], ["Open faults", rep.openFaults], ["Downtime (12 months)", `${rep.downtimeHours} h`], ["Written off", rep.condemned]] as [string, string | number][]).map(([l, v]) => <div key={l} className="card" style={{ margin: 0, minWidth: 130, padding: "10px 14px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div className="small-note" style={{ margin: 0 }}>{l}</div></div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 10 }}>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>By lab</h3><table className="table" style={{ fontSize: 13 }}><thead><tr><th>Lab</th><th>Computers</th><th>Working</th><th>Seats</th></tr></thead><tbody>{labs.filter((l) => !labIds || labIds.includes(l.id)).map((l) => <tr key={l.id}><td>{l.name}</td><td>{l.computers}</td><td style={{ color: l.computersWorking < l.computers ? "#B45309" : undefined }}>{l.computersWorking}</td><td>{l.seats}</td></tr>)}</tbody></table></div>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>By kind and status</h3><p style={{ fontSize: 13 }}>{rep.byCategory.map((c) => `${c.label} ${c.n}`).join(" · ") || "—"}</p><p style={{ fontSize: 13 }}>{Object.entries(rep.byStatus).map(([k, n]) => `${STATUS[k]} ${n}`).join(" · ")}</p></div>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Out of warranty ({rep.outOfWarranty.length})</h3>{rep.outOfWarranty.slice(0, 15).map((a) => <div key={a.id} style={{ fontSize: 13 }}>{a.assetTag} {a.item} — ended {day(a.warrantyEnd)}</div>)}{!rep.outOfWarranty.length && <p className="small-note">None.</p>}</div>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Repeated faults (3+ in 12 months)</h3>{rep.repeated.map((r) => <div key={r.asset.id} style={{ fontSize: 13, color: "#B3261E" }}>{r.asset.assetTag} {r.asset.item} — {r.faults} faults</div>)}{!rep.repeated.length && <p className="small-note">None.</p>}</div>
          </div>
          <HowCalculated shows="How the figures are worked out.">
            <p style={{ margin: 0 }}>Value is the purchase cost of items not written off; age is from the purchase date; downtime adds up the hours from each fault report to its fix (or now, if still open). Computers in labs whose count is signed off set the lab&apos;s computers installed and working, and its specification table.</p>
          </HowCalculated>
        </>
      )}
    </Shell>
  );
}
