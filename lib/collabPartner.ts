import { createHash, randomBytes } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { dataOf, saveData, stepsOf, missingIn, MOC_ITEMS, type Prog } from "./collab";

// Partner-university access to a joint / dual / double degree (Adeel prompt): each partner's focal person gets a
// private link (no OBEHUB account) to see the programme — steps, course mapping, MoC items — and to comment on or
// agree each step. Nothing else of the institute is reachable with it. Links expire and can be revoked.
const db = prisma as unknown as Record<string, any>;
export type PartnerLink = { id: string; partner: string; contact: string; email: string; hash: string; expires: string; createdAt: string; revoked?: boolean; lastSeen?: string };
export type PartnerNote = { linkId: string; partner: string; contact: string; step: string; text: string; agree: boolean; at: string };
type Ext = { partnerLinks?: PartnerLink[]; partnerNotes?: PartnerNote[] };
const hashOf = (t: string) => createHash("sha256").update(t).digest("hex");
const ext = (p: Prog) => dataOf(p) as ReturnType<typeof dataOf> & Ext;

export async function createLink(by: { id: string }, p: Prog, partner: string, contact: string, email: string, days: number) {
  const d = ext(p);
  if (!partner.trim()) throw new Error("Choose the partner.");
  const token = randomBytes(24).toString("base64url");
  const link: PartnerLink = { id: randomBytes(6).toString("hex"), partner: partner.trim().slice(0, 160), contact: contact.trim().slice(0, 120), email: email.trim().slice(0, 160), hash: hashOf(token), expires: new Date(Date.now() + Math.max(7, Math.min(365, days || 90)) * 86400000).toISOString(), createdAt: new Date().toISOString() };
  await saveData(p, { partnerLinks: [...(d.partnerLinks || []), link] } as never);
  await writeAuditLog({ actorUserId: by.id, action: "COLLAB_PARTNER_LINK_CREATED", entityType: "CollabProgramme", entityId: p.id, metadata: { partner: link.partner, contact: link.contact, expires: link.expires } });
  return { token, link };
}
export async function revokeLink(by: { id: string }, p: Prog, linkId: string) {
  const d = ext(p);
  await saveData(p, { partnerLinks: (d.partnerLinks || []).map((l) => (l.id === linkId ? { ...l, revoked: true } : l)) } as never);
  await writeAuditLog({ actorUserId: by.id, action: "COLLAB_PARTNER_LINK_REVOKED", entityType: "CollabProgramme", entityId: p.id, metadata: { linkId } });
}

/** The programme and the link behind a partner token, or null. */
export async function partnerOf(token: string) {
  if (!token || token.length < 20 || !db.collabProgramme) return null;
  const h = hashOf(token);
  const rows = ((await db.collabProgramme.findMany({ where: { dataJson: { contains: h } } }).catch(() => [])) || []) as Prog[];
  for (const p of rows) {
    const l = (ext(p).partnerLinks || []).find((x) => x.hash === h);
    if (l && !l.revoked && new Date(l.expires) > new Date()) return { p, link: l };
  }
  return null;
}

/** What a partner sees: steps with what is still missing, the course mapping, MoC items, and all partners' notes. */
export function partnerView(p: Prog) {
  const d = ext(p);
  return {
    title: p.title, kind: p.kind, partners: d.partners || [], focal: d.focal || "",
    steps: stepsOf(p.kind).map((s) => ({ key: s.key, title: s.title, intro: s.intro, missing: missingIn(p, s), moc: s.moc.map((k) => ({ k, item: MOC_ITEMS.find((x) => x[0] === k)?.[1] || k, text: d.moc?.[k] || "" })) })),
    cem: d.cem || [], mocFrom: d.mocFrom || "", mocUntil: d.mocUntil || "",
    notes: (d.partnerNotes || []).slice(-200),
  };
}

export async function addNote(token: string, step: string, text: string, agree: boolean) {
  const g = await partnerOf(token);
  if (!g) throw new Error("This link has expired or was revoked.");
  if (!stepsOf(g.p.kind).some((s) => s.key === step)) throw new Error("Unknown step.");
  if (!text.trim() && !agree) throw new Error("Write a comment, or agree the step.");
  const d = ext(g.p);
  const note: PartnerNote = { linkId: g.link.id, partner: g.link.partner, contact: g.link.contact, step, text: text.trim().slice(0, 2000), agree, at: new Date().toISOString() };
  await saveData(g.p, { partnerNotes: [...(d.partnerNotes || []), note], partnerLinks: (d.partnerLinks || []).map((l) => (l.id === g.link.id ? { ...l, lastSeen: note.at } : l)) } as never);
  const title = stepsOf(g.p.kind).find((s) => s.key === step)?.title || step;
  await notifyUsers([d.ownerId, g.p.chairmanId], { kind: "COLLAB", title: `${g.link.partner} ${agree ? "agreed" : "commented on"} "${title}" — ${g.p.title}`, body: note.text || undefined, href: `/collab?id=${g.p.id}` });
  await writeAuditLog({ action: agree ? "COLLAB_PARTNER_AGREED" : "COLLAB_PARTNER_COMMENTED", entityType: "CollabProgramme", entityId: g.p.id, metadata: { partner: g.link.partner, step } });
  return { ok: true };
}
