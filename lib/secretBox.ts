import crypto from "crypto";

// Encrypts the institute's teaching-tool secrets (Moodle token, Google service-account key, Microsoft client secret,
// YouTube API key) before they are stored. The key comes from TOOLS_SECRET_KEY, else CALENDAR_TOKEN_KEY, else the
// server's Supabase service key — all server-only. Secrets never leave the server once saved.
function key() {
  const s = process.env.TOOLS_SECRET_KEY || process.env.CALENDAR_TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return s ? crypto.createHash("sha256").update(`obehub-tools:${s}`).digest() : null;
}
export const canSeal = () => !!key();
export function seal(obj: Record<string, string>) {
  const k = key();
  if (!k) throw new Error("The server has no secret key set (TOOLS_SECRET_KEY) to protect the stored credentials.");
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function open(blob: string | null | undefined): Record<string, string> {
  const k = key();
  if (!blob || !k) return {};
  try {
    const [iv, tag, enc] = blob.split(".").map((x) => Buffer.from(x, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
  } catch { return {}; }
}
