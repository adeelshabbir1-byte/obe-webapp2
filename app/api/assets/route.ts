import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { str, num, dateOrNull } from "../../../lib/registers";
import { adb, ASSET_HINT, CATEGORIES, assetScope, labsIn, nextTag, repairStep, requestCondemnation, decideCondemnation, verify, syncLab, type Asset } from "../../../lib/assets";

/**
 * POST { action, ... }
 *   save { id?, labId | room, category, item, makeModel, serialNo, assetTag?, processor, ramGb, storage, gpu, os, spec, purchaseDate, cost, supplier, warrantyEnd, quantity }
 *   repair { faultId, text, status, cost }   condemn { assetId, reason, committeeNote }   decideCondemn { id, approve, note }
 *   verify { labId, foundTags, note }
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sc = await assetScope(user as never);
  const b = await req.json().catch(() => ({}));
  const me = { id: user.id, name: user.name };
  try {
    if (b.action === "decideCondemn") { await decideCondemnation(me, str(b.id), b.approve === true || b.approve === "true", str(b.note, 500)); return NextResponse.json({ ok: true }); }
    if (!sc || !sc.canEdit) return NextResponse.json({ error: "Only lab engineers, lab managers and the facilities manager keep the asset register." }, { status: 403 });
    const labs = await labsIn(sc.chairmanId, sc.departmentIds);
    const labOk = (id: string | null) => !id || labs.some((l) => l.id === id);
    const mine = async (id: string) => { const a = (await adb.asset.findUnique({ where: { id } })) as Asset | null; return a && a.chairmanId === sc.chairmanId && labOk(a.labId) ? a : null; };
    switch (b.action) {
      case "save": {
        const labId = str(b.labId) || null, room = str(b.room, 120) || null;
        if (!labId && !room) return NextResponse.json({ error: "Choose the lab (or type the room)." }, { status: 400 });
        if (!labOk(labId)) return NextResponse.json({ error: "Not one of your labs." }, { status: 403 });
        const item = str(b.item, 200); if (item.length < 2) return NextResponse.json({ error: "Say what the item is." }, { status: 400 });
        const data = { labId, room: labId ? null : room, category: CATEGORIES[str(b.category)] ? str(b.category) : "OTHER", item, makeModel: str(b.makeModel, 200) || null, serialNo: str(b.serialNo, 100) || null, processor: str(b.processor, 100) || null, ramGb: num(b.ramGb), storage: str(b.storage, 60) || null, gpu: str(b.gpu, 100) || null, os: str(b.os, 60) || null, spec: str(b.spec, 1000) || null, purchaseDate: dateOrNull(b.purchaseDate), cost: num(b.cost), supplier: str(b.supplier, 200) || null, warrantyEnd: dateOrNull(b.warrantyEnd), custodianId: str(b.custodianId) || user.id, updatedAt: new Date() };
        if (b.id) {
          const a = await mine(str(b.id)); if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
          await adb.asset.update({ where: { id: a.id }, data }); await syncLab(a.labId); if (a.labId !== labId) await syncLab(labId);
          return NextResponse.json({ ok: true });
        }
        const qty = Math.max(1, Math.min(100, Number(b.quantity) || 1));
        const prefix = labId ? labs.find((l) => l.id === labId)!.name : room!;
        const tags: string[] = [];
        for (let i = 0; i < qty; i++) {
          const tag = qty === 1 && str(b.assetTag) ? str(b.assetTag, 40).toUpperCase() : await nextTag(sc.chairmanId, prefix);
          await adb.asset.create({ data: { id: randomUUID(), chairmanId: sc.chairmanId, assetTag: tag, ...data, serialNo: qty === 1 ? data.serialNo : null } });
          tags.push(tag);
        }
        await syncLab(labId);
        await writeAuditLog({ actorUserId: user.id, action: "ASSET_ADDED", entityType: "Asset", entityId: tags[0], metadata: { count: qty } });
        return NextResponse.json({ ok: true, message: `${qty} item(s) added: ${tags.slice(0, 5).join(", ")}${tags.length > 5 ? " …" : ""}` });
      }
      case "repair": {
        const f = await adb.assetFault.findUnique({ where: { id: str(b.faultId) } });
        if (!f || !(await mine(f.assetId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
        await repairStep(str(b.faultId), me, { text: str(b.text, 500), status: str(b.status), cost: num(b.cost) });
        return NextResponse.json({ ok: true });
      }
      case "condemn": {
        if (!(await mine(str(b.assetId)))) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const reason = str(b.reason || b.note, 1000); if (reason.length < 5) return NextResponse.json({ error: "Give the reason (and the condemnation committee's finding)." }, { status: 400 });
        await requestCondemnation(me, str(b.assetId), reason, str(b.committeeNote, 1000));
        return NextResponse.json({ ok: true, message: "Sent to the Institute Head for approval." });
      }
      case "verify": {
        if (!labOk(str(b.labId)) || !str(b.labId)) return NextResponse.json({ error: "Choose one of your labs." }, { status: 400 });
        const r = await verify(me, sc.chairmanId, str(b.labId), str(b.foundTags, 20000).split(/[\s,;]+/), str(b.note, 1000));
        await writeAuditLog({ actorUserId: user.id, action: "ASSET_VERIFIED", entityType: "LabInfo", entityId: str(b.labId), metadata: { found: r.found, missing: r.missing.length } });
        return NextResponse.json({ ok: true, message: `Signed off: ${r.found} found${r.missing.length ? `, missing: ${r.missing.join(", ")}` : ", nothing missing"}. The lab's computer figures now come from the register.` });
      }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(m) ? ASSET_HINT : m.slice(0, 300) }, { status: 400 }); }
}
