// Student scripts (best / average / weakest samples) are kept in a PRIVATE Supabase Storage bucket and served only
// through the app, to people allowed to see the course. Without storage configured, small files (≤ 2 MB) are kept
// inline instead.
const BUCKET = "student-samples";
const env = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
export const PRIVATE_PREFIX = `private:${BUCKET}/`;

export async function storePrivate(buf: Buffer, name: string, type: string, folder: string): Promise<string> {
  const { url, key } = env();
  if (!url || !key) {
    if (buf.length > 2 * 1024 * 1024) throw new Error("File storage is not set up; files over 2 MB cannot be kept.");
    return `data:${type || "application/octet-stream"};base64,${buf.toString("base64")}`;
  }
  const h = { Authorization: `Bearer ${key}`, apikey: key };
  await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }).catch(() => null);
  const path = `${folder.replace(/[^A-Za-z0-9_-]/g, "")}/${Date.now()}-${name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 120)}`;
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...h, "Content-Type": type || "application/octet-stream", "x-upsert": "false" }, body: new Uint8Array(buf) });
  if (!r.ok) throw new Error(`Storage upload failed (${r.status}).`);
  return PRIVATE_PREFIX + path;
}

/** The file's bytes and type, from private storage, an inline data URL, or (older samples) a public URL. */
export async function readStored(ref: string): Promise<{ buf: Buffer; type: string } | null> {
  if (ref.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(ref);
    return m ? { buf: Buffer.from(m[2], "base64"), type: m[1] } : null;
  }
  if (ref.startsWith(PRIVATE_PREFIX)) {
    const { url, key } = env();
    if (!url || !key) return null;
    const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${ref.slice(PRIVATE_PREFIX.length)}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } }).catch(() => null);
    if (!r?.ok) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
  }
  if (/^https:\/\//.test(ref)) {
    const r = await fetch(ref).catch(() => null);
    if (!r?.ok) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
  }
  return null;
}
