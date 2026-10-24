import { createHash, randomBytes, randomUUID } from "crypto";
import { deflateSync } from "zlib";
import qrcode from "qrcode-generator";
import { headers } from "next/headers";
import { prisma } from "./db";
import { titlesFor, applyTitles } from "./titles";

// Digital sign-off. An official document is issued once: it gets a document number, the SHA-256 hash of its content,
// and sign-off lines built from the approvals already recorded (who approved, their position title in this institute,
// when). The printed copy carries a QR code that opens the public page /verify/<number>, which says Genuine, Revoked,
// Not found, or Altered (when the hash in the QR does not match the one on record). Printing the same document again
// gives the same number; if its content has changed, a new number is issued and the old one stays on record.

const sdb = prisma as unknown as Record<string, any>;
export const SIGN_HINT = "Run prisma/migration_signoff.sql in Supabase to number and sign documents.";

export type Signer = { userId: string | null; name: string; title: string; role: string; at: string };
export type SignedDoc = { id: string; chairmanId: string; docNo: string; kind: string; title: string; holderName: string | null; holderRef: string | null; sourceRef: string | null; contentHash: string; summaryJson: string; signersJson: string; issuedById: string | null; issuedAt: Date; revokedAt: Date | null; revokedById: string | null; revokeReason: string | null };
export type Issued = { docNo: string; hash: string; url: string; signers: Signer[]; issuedAt: Date; revoked: boolean; signatures: Record<string, string>; stamp: string | null };

export const KIND_LABEL: Record<string, string> = { TRANSCRIPT: "Transcript", COURSE_FILE: "Course file", FDP_CERTIFICATE: "FDP certificate", STATUS_LETTER: "Student status letter", SAR: "Self-Assessment Report", OFFER_LETTER: "Offer letter", CLEARANCE: "Clearance certificate", OUTCOMES_REPORT: "Outcomes report", DEGREE_AUDIT: "Degree audit", FACULTY_REPORT: "Faculty performance report" };
const KIND_CODE: Record<string, string> = { TRANSCRIPT: "TR", COURSE_FILE: "CF", FDP_CERTIFICATE: "FDP", STATUS_LETTER: "SL", SAR: "SAR", OFFER_LETTER: "OL", CLEARANCE: "CL", OUTCOMES_REPORT: "OR", DEGREE_AUDIT: "DA", FACULTY_REPORT: "FR" };

/** A stable hash of the document's content: keys sorted, so the same facts always give the same hash. */
export function contentHash(content: unknown): string {
  const norm = (v: unknown): unknown => (Array.isArray(v) ? v.map(norm) : v && typeof v === "object" && !(v instanceof Date) ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v instanceof Date ? v.toISOString() : v);
  return createHash("sha256").update(JSON.stringify(norm(content))).digest("hex");
}

const ALPH = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function newNumber(prefix: string, kind: string) {
  const b = randomBytes(6); let s = ""; for (const x of b) s += ALPH[x % ALPH.length];
  return `${prefix}-${KIND_CODE[kind] || "DOC"}-${new Date().getUTCFullYear()}-${s}`;
}
async function prefixFor(chairmanId: string) {
  const h = await prisma.user.findUnique({ where: { id: chairmanId }, select: { instituteName: true } }).catch(() => null);
  const words = (h?.instituteName || "OBE").replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|for)$/i.test(w));
  return (words.length >= 2 ? words.map((w) => w[0]).join("") : (words[0] || "OBE").slice(0, 3)).toUpperCase().slice(0, 4);
}

export function appBaseFrom(host?: string | null, proto?: string | null) {
  const env = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (env) return env.replace(/\/$/, "");
  return host ? `${proto || (host.startsWith("localhost") ? "http" : "https")}://${host}` : "";
}
/** The host of the current request (pages and API routes), for the verification address when NEXT_PUBLIC_APP_URL is not set. */
export function requestOrigin(): { host: string | null; proto: string | null } {
  try { const h = headers(); return { host: h.get("x-forwarded-host") || h.get("host"), proto: h.get("x-forwarded-proto") }; } catch { return { host: null, proto: null }; }
}
/** The address the QR opens; the short hash lets the page tell a genuine copy from an altered number. */
export const verifyPath = (docNo: string, hash: string) => `/verify/${encodeURIComponent(docNo)}?h=${hash.slice(0, 16)}`;

/** Sign-off lines from recorded approvals, with the institute's own position titles. */
export async function signersFrom(chairmanId: string, rows: { userId: string | null | undefined; role: string; position?: string; at: Date | string | null | undefined }[]): Promise<Signer[]> {
  const ids = rows.map((r) => r.userId).filter((x): x is string => !!x);
  const users = await prisma.user.findMany({ where: { id: { in: ids.concat(["none"]) } }, select: { id: true, name: true, role: true } });
  const titles = await titlesFor(chairmanId).catch(() => null);
  const ROLE_TITLE: Record<string, string> = { CHAIRMAN: "Institute Head", DEAN: "Dean", HEAD_OF_DEPARTMENT: "Head of Department", PROGRAM_COORDINATOR: "Program Lead", INSTRUCTOR: "Instructor", SUBJECT_EXPERT: "University Subject Expert", OMC: "OMC", FINANCE_OFFICER: "Finance Officer", STUDENT_AFFAIRS: "Student Affairs", LIBRARIAN: "Librarian" };
  const out: Signer[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const u = users.find((x) => x.id === r.userId);
    if (!u || !r.at || seen.has(`${u.id}|${r.role}`)) continue;
    seen.add(`${u.id}|${r.role}`);
    const pos = r.position || ROLE_TITLE[u.role] || u.role;
    out.push({ userId: u.id, name: u.name, title: titles ? applyTitles(pos, titles) : pos, role: r.role, at: new Date(r.at).toISOString() });
  }
  return out;
}

/** Issue (or find again) the signed copy of a document. Returns null when the migration has not been run. */
export async function issueDocument(inp: { chairmanId: string; kind: string; title: string; holderName?: string | null; holderRef?: string | null; sourceRef: string; content: unknown; summary: Record<string, string | number | null>; signers: Signer[]; issuer?: { userId: string; role: string; position?: string }; issuedById?: string | null; host?: string | null; proto?: string | null }): Promise<Issued | null> {
  const hash = contentHash({ kind: inp.kind, content: inp.content, signers: inp.signers.map((s) => [s.userId, s.role, s.at]) });
  let doc: SignedDoc | null = null;
  try {
    doc = (await sdb.signedDocument.findFirst({ where: { chairmanId: inp.chairmanId, kind: inp.kind, sourceRef: inp.sourceRef, contentHash: hash, revokedAt: null }, orderBy: { issuedAt: "desc" } })) as SignedDoc | null; // a withdrawn copy is never re-used
    if (!doc) {
      const prefix = await prefixFor(inp.chairmanId);
      for (let i = 0; i < 4 && !doc; i++) {
        try {
          // The officer issuing the copy signs at the moment of first issue (not part of the fingerprint, so a re-print keeps the number).
          const all = inp.issuer ? [...inp.signers, ...(await signersFrom(inp.chairmanId, [{ userId: inp.issuer.userId, role: inp.issuer.role, position: inp.issuer.position, at: new Date() }]))] : inp.signers;
          doc = (await sdb.signedDocument.create({ data: { id: randomUUID(), chairmanId: inp.chairmanId, docNo: newNumber(prefix, inp.kind), kind: inp.kind, title: inp.title.slice(0, 300), holderName: inp.holderName || null, holderRef: inp.holderRef || null, sourceRef: inp.sourceRef, contentHash: hash, summaryJson: JSON.stringify(inp.summary), signersJson: JSON.stringify(all), issuedById: inp.issuedById || null } })) as SignedDoc;
        } catch (e) { if (i === 3) throw e; } // a number already used: try another
      }
    }
  } catch { return null; }
  if (!doc) return null;
  const signers = JSON.parse(doc.signersJson) as Signer[];
  const assets = await assetsFor(inp.chairmanId, signers.map((s) => s.userId).filter((x): x is string => !!x));
  const o = inp.host ? { host: inp.host, proto: inp.proto || null } : requestOrigin();
  return { docNo: doc.docNo, hash: doc.contentHash, url: appBaseFrom(o.host, o.proto) + verifyPath(doc.docNo, doc.contentHash), signers, issuedAt: doc.issuedAt, revoked: !!doc.revokedAt, signatures: assets.signatures, stamp: assets.stamp };
}

/** Signature images of these signers and the institute stamp, as data URLs. */
export async function assetsFor(chairmanId: string, userIds: string[]): Promise<{ signatures: Record<string, string>; stamp: string | null }> {
  try {
    const rows = (await sdb.signatureAsset.findMany({ where: { chairmanId, OR: [{ userId: { in: userIds.concat(["none"]) }, kind: "SIGNATURE" }, { kind: "STAMP" }] } })) as { userId: string | null; kind: string; mime: string; data: string }[];
    const signatures: Record<string, string> = {};
    for (const r of rows) if (r.kind === "SIGNATURE" && r.userId) signatures[r.userId] = `data:${r.mime};base64,${r.data}`;
    const st = rows.find((r) => r.kind === "STAMP");
    return { signatures, stamp: st ? `data:${st.mime};base64,${st.data}` : null };
  } catch { return { signatures: {}, stamp: null }; }
}

export type Check = { result: "GENUINE" | "ALTERED" | "REVOKED" | "NOT_FOUND"; doc: SignedDoc | null; instituteName: string | null };
/** Check a number (and the short hash from the QR), and log the check. */
export async function verify(docNo: string, shortHash: string | null, who: { checkerId?: string | null; ip?: string | null; userAgent?: string | null }): Promise<Check | "missing"> {
  let doc: SignedDoc | null = null;
  try { doc = (await sdb.signedDocument.findUnique({ where: { docNo: docNo.trim().toUpperCase() } })) as SignedDoc | null; } catch { return "missing"; }
  const result: Check["result"] = !doc ? "NOT_FOUND" : doc.revokedAt ? "REVOKED" : shortHash && !doc.contentHash.startsWith(shortHash.toLowerCase()) ? "ALTERED" : "GENUINE";
  await sdb.documentVerification.create({ data: { id: randomUUID(), documentId: doc?.id || null, docNo: docNo.slice(0, 80), result, checkerId: who.checkerId || null, ipHash: who.ip ? createHash("sha256").update(who.ip).digest("hex").slice(0, 16) : null, userAgent: (who.userAgent || "").slice(0, 200) || null } }).catch(() => {});
  const inst = doc ? await prisma.user.findUnique({ where: { id: doc.chairmanId }, select: { instituteName: true } }).catch(() => null) : null;
  return { result, doc, instituteName: inst?.instituteName || null };
}

/** The QR as a square matrix of dark (true) / light cells. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}
/** The QR as an SVG string (for printable pages). */
export function qrSvg(text: string, size = 110) {
  const m = qrMatrix(text), n = m.length, q = 2, total = n + 2 * q;
  let path = "";
  m.forEach((row, r) => row.forEach((d, c) => { if (d) path += `M${c + q} ${r + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
/** The QR as a GIF data URL (for Word documents). */
export function qrGif(text: string, cell = 4) { const qr = qrcode(0, "M"); qr.addData(text); qr.make(); return qr.createDataURL(cell, 8); }

/** Who sees every issued document, the verification log, and can withdraw documents. */
export const canManageSigned = (w: { head: boolean; exam: boolean; qec: boolean }) => w.head || w.exam || w.qec;

/** The QR as a PNG (black on white, a quiet zone of 4 cells), for Word documents. */
export function qrPng(text: string, scale = 4): Buffer {
  const m = qrMatrix(text), q = 4, n = m.length + 2 * q, size = n * scale;
  const raw = Buffer.alloc((size + 1) * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0; // filter: none
    const r = Math.floor(y / scale) - q;
    for (let x = 0; x < size; x++) { const c = Math.floor(x / scale) - q; if (r >= 0 && c >= 0 && r < m.length && c < m.length && m[r][c]) raw[y * (size + 1) + 1 + x] = 0; }
  }
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
