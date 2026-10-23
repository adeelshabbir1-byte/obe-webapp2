import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { makeBackup, readBackup, restore, storeBackup, fetchBackup, storageReady } from "../../../lib/instituteBackup";

export const maxDuration = 300;

async function head() {
  const u = await getAuthenticatedUser();
  return u && u.mfaVerified && u.role === "CHAIRMAN" ? u : null;
}

// GET ?now=1 (make and download a backup) | ?name=<file> (download a stored one).
export async function GET(req: NextRequest) {
  const u = await head();
  if (!u) return NextResponse.json({ error: "Only the Institute Head can take backups." }, { status: 403 });
  const name = req.nextUrl.searchParams.get("name");
  try {
    const out = name ? { data: await fetchBackup(u.id, name), name } : await makeBackup(u.id);
    await writeAuditLog({ actorUserId: u.id, action: "INSTITUTE_BACKUP_DOWNLOADED", metadata: { name: out.name } });
    return new NextResponse(out.data as unknown as BodyInit, { headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${out.name}"` } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

// POST JSON { action: "store" } | { action: "check" | "restore", name } ; or multipart { action, file }.
export async function POST(req: NextRequest) {
  const u = await head();
  if (!u) return NextResponse.json({ error: "Only the Institute Head can restore." }, { status: 403 });
  try {
    let action = "", buf: Buffer | null = null;
    if ((req.headers.get("content-type") || "").includes("multipart")) {
      const fd = await req.formData(); action = String(fd.get("action") || ""); const f = fd.get("file") as File | null;
      if (!f) throw new Error("Choose the backup file.");
      buf = Buffer.from(await f.arrayBuffer());
    } else {
      const b = await req.json(); action = String(b.action || "");
      if (action === "store") {
        if (!storageReady()) throw new Error("Stored backups need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
        const m = await makeBackup(u.id); await storeBackup(u.id, m.data, m.name);
        return NextResponse.json({ ok: true, message: `Backup stored: ${Object.values(m.counts).reduce((a, n) => a + n, 0).toLocaleString()} rows.` });
      }
      buf = await fetchBackup(u.id, String(b.name || ""));
    }
    const bk = readBackup(buf);
    const report = await restore(u.id, bk, action === "restore", u.id);
    const restored = report.reduce((a, r) => a + r.restored, 0), missing = report.reduce((a, r) => a + r.missing, 0);
    return NextResponse.json({ ok: true, from: bk.createdAt, report, message: action === "restore" ? `Restored ${restored} row(s).` : `${missing} row(s) of this backup are missing now.` });
  } catch (e) { return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: 400 }); }
}
