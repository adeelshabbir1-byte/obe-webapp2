import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import UploadForm from "../../components/UploadForm";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, rdb } from "../../lib/registers";
import { KIND_LABEL, SIGN_HINT, canManageSigned, verifyPath, type SignedDoc } from "../../lib/signoff";
import { ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const day = (d: Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const RESULT_COLOUR: Record<string, string> = { GENUINE: "#1E6B3A", ALTERED: "#B3261E", REVOKED: "#B3261E", NOT_FOUND: "#9A3412" };

// Signed documents: every official document issued with a number and QR code, who checked them, withdrawing a
// document, and each person's signature image (and the institute stamp).
export default async function SignedDocumentsPage({ searchParams }: { searchParams: { kind?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || user.role === "SUPER_USER") redirect("/dashboard");
  const manage = canManageSigned(w), canRevoke = w.head || w.exam;
  let docs: SignedDoc[] = [], logs: { docNo: string; result: string; checkedAt: Date; checkerId: string | null }[] = [], missing = false;
  let mySig: { uploadedAt: Date } | null = null, stamp: { uploadedAt: Date } | null = null;
  const q = (searchParams.q || "").trim();
  try {
    const where: Record<string, unknown> = { chairmanId: w.chairmanId, ...(searchParams.kind ? { kind: searchParams.kind } : {}), ...(q ? { OR: [{ docNo: { contains: q, mode: "insensitive" } }, { holderName: { contains: q, mode: "insensitive" } }, { holderRef: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}) };
    if (!manage) where.signersJson = { contains: `"userId":"${user.id}"` };
    docs = await rdb.signedDocument.findMany({ where, orderBy: { issuedAt: "desc" }, take: 200 });
    if (manage) {
      const ids = ((await rdb.signedDocument.findMany({ where: { chairmanId: w.chairmanId }, select: { id: true } })) as { id: string }[]).map((d) => d.id);
      logs = await rdb.documentVerification.findMany({ where: { documentId: { in: ids.concat(["none"]) } }, orderBy: { checkedAt: "desc" }, take: 60 });
    }
    mySig = await rdb.signatureAsset.findFirst({ where: { chairmanId: w.chairmanId, userId: user.id, kind: "SIGNATURE" }, select: { uploadedAt: true } });
    stamp = await rdb.signatureAsset.findFirst({ where: { chairmanId: w.chairmanId, kind: "STAMP" }, select: { uploadedAt: true } });
  } catch { missing = true; }
  const checks = new Map<string, number>(); for (const l of logs) checks.set(l.docNo, (checks.get(l.docNo) || 0) + 1);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Signed Documents</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>Official documents carry a number, sign-off lines from the approvals already recorded, and a QR code. Anyone can check one at <a href="/verify">/verify</a> — no sign-in needed.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{SIGN_HINT}</p></div>}
      <HowCalculated shows="How numbering, signing and checking work.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>A document is numbered the first time it is printed. Printing it again gives the same number; if its content has changed (a grade changed, a new approval), it gets a new number and the old one stays on record.</li>
          <li>The sign-off lines come only from recorded approvals: the person&apos;s name, their position title in this institute, and the date and time they approved. Signature images are placed only for those people.</li>
          <li>The QR code holds the number and the first part of the content&apos;s SHA-256 fingerprint. The check page says Genuine, Revoked, Not found, or Altered (the fingerprint does not match).</li>
        </ul>
      </HowCalculated>

      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>My signature</h2>
      <div className="card">
        <p className="small-note" style={{ marginTop: 0 }}>{mySig ? `Uploaded ${day(mySig.uploadedAt)}.` : "No signature image yet — documents show your name, title and the time of your approval."} A PNG or JPEG on a white or clear background, up to 300 KB.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <UploadForm url="/api/signoff" fixed={{ kind: "SIGNATURE" }} fields={[]} file={{ name: "file", label: "Signature image", accept: "image/png,image/jpeg" }} submit={mySig ? "Replace signature" : "Upload signature"} collapsed openLabel={mySig ? "Replace my signature…" : "Upload my signature…"} />
          {mySig && <ActionButton url="/api/signoff" body={{ action: "removeAsset", kind: "SIGNATURE" }} label="Remove" className="btn btn-secondary btn-sm" confirmText="Remove your signature image?" />}
        </div>
        {w.head && (
          <div style={{ marginTop: 12 }}>
            <p className="small-note" style={{ marginTop: 0 }}><b>Institute stamp</b>: {stamp ? `uploaded ${day(stamp.uploadedAt)}` : "none yet"}.</p>
            <UploadForm url="/api/signoff" fixed={{ kind: "STAMP" }} fields={[]} file={{ name: "file", label: "Stamp image", accept: "image/png,image/jpeg" }} submit="Save stamp" collapsed openLabel={stamp ? "Replace the stamp…" : "Upload the institute stamp…"} />
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: "18px 0 6px" }}>{manage ? "Documents issued" : "Documents I signed"} ({docs.length}{docs.length === 200 ? "+" : ""})</h2>
      <form method="get" className="card no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 8 }}>
        <label style={{ fontSize: 13 }}>Kind<br /><select name="kind" className="input" defaultValue={searchParams.kind || ""}><option value="">All</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label style={{ fontSize: 13 }}>Search<br /><input name="q" className="input" defaultValue={q} placeholder="number, name, roll no." /></label>
        <button className="btn btn-brass btn-sm" type="submit">Show</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}>
          <thead><tr><th>Document No.</th><th>What</th><th>Issued to</th><th>Issued</th><th>Checked</th><th>Status</th><th></th></tr></thead>
          <tbody>{docs.map((d) => (
            <tr key={d.id}>
              <td><a href={verifyPath(d.docNo, d.contentHash)} target="_blank" rel="noreferrer"><b>{d.docNo}</b></a></td>
              <td>{KIND_LABEL[d.kind] || d.kind}<div className="small-note" style={{ margin: 0 }}>{d.title}</div></td>
              <td>{d.holderName || "—"}<div className="small-note" style={{ margin: 0 }}>{d.holderRef || ""}</div></td>
              <td style={{ whiteSpace: "nowrap" }}>{day(d.issuedAt)}</td>
              <td>{checks.get(d.docNo) || 0}</td>
              <td>{d.revokedAt ? <span style={{ color: "#B3261E", fontWeight: 700 }}>Revoked {day(d.revokedAt)}<div className="small-note" style={{ margin: 0 }}>{d.revokeReason}</div></span> : <span style={{ color: "#1E6B3A", fontWeight: 700 }}>Valid</span>}</td>
              <td>{canRevoke && !d.revokedAt && <ActionButton url="/api/signoff" body={{ action: "revoke", id: d.id }} label="Withdraw" className="btn btn-danger btn-sm" askNote="Why is this document withdrawn? (shown on the verification page)" noteRequired />}</td>
            </tr>
          ))}</tbody>
        </table>
        {docs.length === 0 && <p className="small-note">No documents yet. They are numbered when an official copy is printed (transcripts, course files, FDP certificates, status letters, SAR).</p>}
      </div>

      {manage && (
        <>
          <h2 style={{ fontSize: 17, margin: "18px 0 6px" }}>Verification log</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>When</th><th>Document No.</th><th>Result</th><th>Checked by</th></tr></thead>
              <tbody>{logs.map((l, i) => (
                <tr key={i}><td>{day(l.checkedAt)}</td><td>{l.docNo}</td><td style={{ color: RESULT_COLOUR[l.result], fontWeight: 700 }}>{l.result.replace("_", " ").toLowerCase()}</td><td>{l.checkerId ? "a signed-in user" : "public (QR scan)"}</td></tr>
              ))}</tbody>
            </table>
            {logs.length === 0 && <p className="small-note">No checks yet.</p>}
          </div>
        </>
      )}
    </Shell>
  );
}
