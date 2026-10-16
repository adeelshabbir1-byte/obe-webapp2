import crypto from "crypto";

// The rotating QR token of a live attendance session.
//
// Each session has its own 256-bit key, kept in the database and never sent to any browser. Every few seconds
// (the session's rotateSeconds) the instructor's screen shows a new token: the time window number and a random
// nonce, encrypted with AES-256-GCM, with the session id bound in as authenticated data. A token can't be forged
// or moved to another session, and it stops working one window after the next one appears, so a photo of the code
// sent to someone off-site is useless within seconds.

export const newSessionKey = () => crypto.randomBytes(32).toString("hex");

const b64u = (b: Buffer) => b.toString("base64url");

/** Which time window a moment falls in, counted from the session's start. */
export const windowAt = (startedAt: Date, rotateSeconds: number, at = Date.now()) => Math.max(0, Math.floor((at - startedAt.getTime()) / (rotateSeconds * 1000)));

/** The token shown during window `w`. */
export function issueToken(session: { id: string; keyHex: string }, w: number): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(session.keyHex, "hex"), iv);
  cipher.setAAD(Buffer.from(session.id));
  const plain = Buffer.alloc(8);
  plain.writeUInt32BE(w >>> 0, 0);
  crypto.randomBytes(4).copy(plain, 4);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return `${session.id}.${b64u(Buffer.concat([iv, ct, cipher.getAuthTag()]))}`;
}

/** The session id a token names (before it is checked). */
export function tokenSessionId(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const m = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{40,80})$/.exec(token.trim());
  return m ? m[1] : null;
}

export type TokenCheck = { ok: true; window: number } | { ok: false; reason: "INVALID" | "EXPIRED" };

/** Whether a token was made by this session and is from the current or the previous window. */
export function checkToken(token: string, session: { id: string; keyHex: string; startedAt: Date; rotateSeconds: number }, at = Date.now()): TokenCheck {
  const [sid, body] = token.trim().split(".");
  if (sid !== session.id || !body) return { ok: false, reason: "INVALID" };
  let w: number;
  try {
    const raw = Buffer.from(body, "base64url");
    if (raw.length !== 12 + 8 + 16) return { ok: false, reason: "INVALID" };
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(session.keyHex, "hex"), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(session.id));
    decipher.setAuthTag(raw.subarray(20));
    const plain = Buffer.concat([decipher.update(raw.subarray(12, 20)), decipher.final()]);
    w = plain.readUInt32BE(0);
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  const now = windowAt(session.startedAt, session.rotateSeconds, at);
  if (w > now) return { ok: false, reason: "INVALID" };
  if (now - w > 1) return { ok: false, reason: "EXPIRED" };
  return { ok: true, window: w };
}

/** The part of an address that stays the same on one network (IPv4 /24, IPv6 /64). */
export function networkKeyOf(ip: string | null | undefined): string | null {
  const a = (ip || "").split(",")[0].trim().replace(/^::ffff:/, "");
  if (!a) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(a)) return a.split(".").slice(0, 3).join(".");
  if (a.includes(":")) return a.toLowerCase().split(":").slice(0, 4).join(":");
  return a;
}

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

// A scan claim: proof that this device read a valid code at a moment, so a student who must first type their roll
// number and password isn't beaten by the code changing. It lasts two minutes and only works from the same device.
export const CLAIM_TTL_MS = 120_000;

export function issueClaim(session: { id: string; keyHex: string }, deviceId: string, scannedAt = Date.now()): string {
  const mac = crypto.createHmac("sha256", Buffer.from(session.keyHex, "hex")).update(`${session.id}|${scannedAt}|${deviceId}`).digest("base64url");
  return `${session.id}.${scannedAt}.${mac}`;
}

/** The moment the code was scanned, if the claim is genuine, recent and from this device. */
export function checkClaim(claim: unknown, session: { id: string; keyHex: string }, deviceId: string, at = Date.now()): number | null {
  if (typeof claim !== "string" || claim.length > 200) return null;
  const [sid, ts, mac] = claim.split(".");
  const scannedAt = Number(ts);
  if (sid !== session.id || !Number.isFinite(scannedAt) || !mac) return null;
  if (scannedAt > at + 5_000 || at - scannedAt > CLAIM_TTL_MS) return null;
  const want = crypto.createHmac("sha256", Buffer.from(session.keyHex, "hex")).update(`${session.id}|${scannedAt}|${deviceId}`).digest();
  const got = Buffer.from(mac, "base64url");
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? scannedAt : null;
}
