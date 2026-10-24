import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { rdb, putBytes, pdfText, storageReady } from "./regulations";
import { writeAuditLog } from "./audit";

// Starter documents of the Regulations Library (regulations-seed/): official HEC / NCEAC documents already at hand,
// with page screenshots and the clauses OBEHUB applies. Loaded once by the Super Admin; skipped if already there.
type SeedDoc = { council: string; kind: string; title: string; number: string | null; issuedOn: string | null; url: string | null; summary: string; files: { file: string; mime: string; caption: string }[]; clauses: { ref: string; page: number; image?: string; quote: string; targets: string[] }[] };

export async function seedStarter(user: { id: string }) {
  if (!storageReady()) throw new Error("File storage is not set up (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).");
  const dir = path.join(process.cwd(), "regulations-seed");
  const docs = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")) as SeedDoc[];
  let added = 0;
  for (const d of docs) {
    if (await rdb.regDocument.findFirst({ where: { title: d.title } })) continue;
    const id = randomUUID();
    await rdb.regDocument.create({ data: { id, council: d.council, kind: d.kind, title: d.title, number: d.number, issuedOn: d.issuedOn ? new Date(d.issuedOn) : null, url: d.url, summary: d.summary, status: "PUBLISHED", submittedById: user.id, reviewedById: user.id, reviewedAt: new Date(), confirmJson: "{}" } });
    const fileIds = new Map<string, string>();
    for (const f of d.files) {
      const data = await fs.readFile(path.join(dir, f.file));
      const p = `${id}/${f.file}`;
      await putBytes(p, data, f.mime);
      const fid = randomUUID();
      await rdb.regFile.create({ data: { id: fid, docId: id, path: p, name: f.file, mime: f.mime, size: data.length, caption: f.caption, createdById: user.id } });
      fileIds.set(f.file, fid);
      if (f.mime === "application/pdf") { const t = await pdfText(data); if (t) await rdb.regDocument.update({ where: { id }, data: { textContent: t } }); }
    }
    for (const c of d.clauses) {
      const cid = randomUUID();
      await rdb.regClause.create({ data: { id: cid, docId: id, ref: c.ref, page: c.page, quote: c.quote, imageFileId: c.image ? fileIds.get(c.image) || null : null, createdById: user.id } });
      for (const t of c.targets) await rdb.regLink.create({ data: { clauseId: cid, target: t, createdById: user.id } });
    }
    added++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "REG_STARTER_LOADED", entityType: "RegDocument", entityId: "seed", metadata: { added } });
  return added ? `${added} starter document(s) loaded with their screenshots and clauses.` : "The starter documents are already in the library.";
}
