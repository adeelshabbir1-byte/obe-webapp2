import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, staffOf, str, num, dateOrNull } from "../../../lib/registers";
import { xdb, RES_HINT, isOric, submitForReview, review, decide, fetchOrcid, parseBibtex, parseLines, addCandidates, confirm, type Proposal } from "../../../lib/research";
import { withErrors } from "../../../lib/apiHandler";

/**
 * POST { action, ... } — every member of staff for their own research; ORIC (and the Institute Head) review and record decisions.
 *   profile { orcid, scholarUrl }   importOrcid {}   importText { text, format: bibtex | lines }   confirm { id, add, category, studentWork }
 *   proposal { id?, title, agency, callName, amount, durationMonths, coInvestigators, abstract }   submit { id }
 *   review { id, ok, note }   decide { id, awarded, amount, startDate, endDate }
 *   journal { id?, title, issn, category, impactFactor }   removeJournal { id }   oric { userId, on } (the Institute Head)
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const me = { id: user.id, name: user.name };
  try {
    switch (b.action) {
      case "profile": {
        const orcid = str(b.orcid, 40).replace(/^https?:\/\/orcid\.org\//, "") || null;
        if (orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) return NextResponse.json({ error: "An ORCID iD looks like 0000-0002-1825-0097." }, { status: 400 });
        const scholarUrl = str(b.scholarUrl, 300) || null;
        if (scholarUrl && !/^https:\/\/scholar\.google\./.test(scholarUrl)) return NextResponse.json({ error: "Paste the address of your Google Scholar profile (https://scholar.google.com/citations?user=…)." }, { status: 400 });
        await xdb.researchProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, chairmanId: w.chairmanId, orcid, scholarUrl }, update: { orcid, scholarUrl, updatedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }
      case "importOrcid": {
        const p = await xdb.researchProfile.findUnique({ where: { userId: user.id } });
        if (!p?.orcid) return NextResponse.json({ error: "Save your ORCID iD first." }, { status: 400 });
        const works = await fetchOrcid(p.orcid);
        const r = await addCandidates(user.id, w.chairmanId, "ORCID", works);
        await xdb.researchProfile.update({ where: { userId: user.id }, data: { lastImportAt: new Date() } });
        return NextResponse.json({ ok: true, message: `${works.length} work(s) on ORCID: ${r.added} new to confirm, ${r.duplicates} already on your profile or waiting.` });
      }
      case "importText": {
        const text = str(b.text, 200000);
        const items = b.format === "bibtex" || /@\w+\s*\{/.test(text) ? parseBibtex(text) : parseLines(text);
        if (!items.length) return NextResponse.json({ error: "Nothing could be read. Paste a BibTeX export, or one paper per line: Title | Journal | Year | DOI | Citations." }, { status: 400 });
        const r = await addCandidates(user.id, w.chairmanId, b.format === "bibtex" || /@\w+\s*\{/.test(text) ? "BIBTEX" : "PASTE", items);
        return NextResponse.json({ ok: true, message: `${items.length} read: ${r.added} new to confirm, ${r.duplicates} already on your profile or waiting.` });
      }
      case "confirm": await confirm(user.id, str(b.id), { add: b.add !== false && b.add !== "false", category: str(b.category), studentWork: b.studentWork === true || b.studentWork === "true" }); return NextResponse.json({ ok: true });
      case "proposal": {
        const title = str(b.title, 300), agency = str(b.agency, 200);
        if (title.length < 5 || agency.length < 2) return NextResponse.json({ error: "Give the title and the funding agency." }, { status: 400 });
        const data = { title, agency, callName: str(b.callName, 200) || null, amount: num(b.amount), durationMonths: num(b.durationMonths), coInvestigators: str(b.coInvestigators, 500) || null, abstract: str(b.abstract, 5000) || null, updatedAt: new Date() };
        if (b.id) { const p = (await xdb.grantProposal.findUnique({ where: { id: str(b.id) } })) as Proposal | null; if (!p || p.piId !== user.id || !["DRAFT", "RETURNED"].includes(p.status)) return NextResponse.json({ error: "Not found." }, { status: 404 }); await xdb.grantProposal.update({ where: { id: p.id }, data }); }
        else await xdb.grantProposal.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, piId: user.id, ...data } });
        return NextResponse.json({ ok: true });
      }
      case "submit": await submitForReview(me, str(b.id)); return NextResponse.json({ ok: true, message: "Sent to ORIC for review." });
      case "review": case "decide": case "journal": case "removeJournal": {
        if (!(await isOric(w))) return NextResponse.json({ error: "Only ORIC (or the Institute Head) does this." }, { status: 403 });
        if (b.action === "review") { await review(me, str(b.id), b.ok === true || b.ok === "true", str(b.note || b.reviewNote, 1000)); return NextResponse.json({ ok: true }); }
        if (b.action === "decide") { await decide(me, str(b.id), b.awarded === true || b.awarded === "true", { amount: num(b.amount), start: dateOrNull(b.startDate), end: dateOrNull(b.endDate) }); return NextResponse.json({ ok: true }); }
        if (b.action === "removeJournal") { await xdb.journalCategory.deleteMany({ where: { id: str(b.id), chairmanId: w.chairmanId } }); return NextResponse.json({ ok: true }); }
        const title = str(b.title, 300); const category = ["W", "X", "Y"].includes(str(b.category)) ? str(b.category) : null;
        if (title.length < 2 || !category) return NextResponse.json({ error: "Give the journal and its HEC category (W, X or Y)." }, { status: 400 });
        const data = { title, issn: str(b.issn, 20) || null, category, impactFactor: num(b.impactFactor), updatedAt: new Date() };
        if (b.id) await xdb.journalCategory.updateMany({ where: { id: str(b.id), chairmanId: w.chairmanId }, data }); else await xdb.journalCategory.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, ...data } });
        return NextResponse.json({ ok: true });
      }
      case "oric": {
        if (!w.head) return NextResponse.json({ error: "Only the Institute Head names the ORIC staff." }, { status: 403 });
        const id = str(b.userId); if (!(await staffOf(w.chairmanId)).some((s) => s.id === id)) return NextResponse.json({ error: "Choose a member of staff." }, { status: 400 });
        const cur = JSON.parse((await xdb.researchSetting.findUnique({ where: { chairmanId: w.chairmanId } }))?.oricUserIds || "[]") as string[];
        const next = b.on === false || b.on === "false" ? cur.filter((x) => x !== id) : Array.from(new Set([...cur, id]));
        await xdb.researchSetting.upsert({ where: { chairmanId: w.chairmanId }, create: { chairmanId: w.chairmanId, oricUserIds: JSON.stringify(next) }, update: { oricUserIds: JSON.stringify(next), updatedAt: new Date() } });
        await writeAuditLog({ actorUserId: user.id, action: "ORIC_STAFF_SET", entityType: "User", entityId: id, metadata: { on: next.includes(id) } });
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(m) ? RES_HINT : m.slice(0, 300) }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
