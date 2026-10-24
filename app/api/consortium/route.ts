import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { CONSORTIUM_HINT, applyToJoin, decideMember, saveResidency, saveNoc, saveCentre, registerEmployee, endAffiliation, sponsor, renewSponsored, saveRuleSet, lookupPerson, memberOf, cdb, myPeople } from "../../../lib/consortium";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action, ... } — Super Admin: rules, member, lookup. Institute Head (Chairman): apply, residency, noc, centre,
// register, registerAll, end, sponsor, renew.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, message, ...extra });
  try {
    if (["rules", "member", "lookup"].includes(b.action)) {
      if (user.role !== "SUPER_USER") return NextResponse.json({ error: "Only the Super Admin can do this." }, { status: 403 });
      if (b.action === "rules") { const v = await saveRuleSet(user.id, { label: str(b.label, 120), effectiveFrom: str(b.effectiveFrom, 30), note: str(b.note, 500), rules: b }); return ok(`Rules book version ${v} saved.`); }
      if (b.action === "member") { await decideMember(user.id, str(b.chairmanId, 60), b.status, str(b.note, 500)); return ok(b.status === "ACTIVE" ? "Admitted to the consortium." : "Saved."); }
      const p = await lookupPerson(str(b.cnic, 20));
      return ok(p ? `${p.name} (${p.cnic}): ${p.accounts.length} account(s)` : "No one is registered under this CNIC.", { person: p });
    }
    if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "The Institute Head manages the consortium membership." }, { status: 403 });
    const me = user.id;
    if (b.action === "apply") return ok(await applyToJoin(me, me, { country: str(b.country, 2), city: str(b.city, 80), website: str(b.website, 200), hecRecognized: b.hecRecognized === true, contactName: str(b.contactName, 120), contactEmail: str(b.contactEmail, 160), note: str(b.note, 800) }));
    const m = await memberOf(me);
    if (!m) return NextResponse.json({ error: "Apply to join the consortium first." }, { status: 400 });
    switch (b.action) {
      case "residency": await saveResidency(me, me, b); return ok("Residency rules saved.");
      case "noc": await saveNoc(me, me, { id: str(b.id, 60) || undefined, kind: str(b.kind, 40), number: str(b.number, 120), programme: str(b.programme, 160), issuedOn: str(b.issuedOn, 30), expiresOn: str(b.expiresOn, 30), note: str(b.note, 500) }); return ok("NOC saved.");
      case "nocDelete": { const n = await cdb.consortiumNoc.findUnique({ where: { id: str(b.id, 60) } }); if (!n || n.chairmanId !== me) throw new Error("Not found."); await cdb.consortiumNoc.delete({ where: { id: n.id } }); return ok("Removed."); }
      case "centre": await saveCentre(me, me, { id: str(b.id, 60) || undefined, name: str(b.name, 120), city: str(b.city, 80), address: str(b.address, 300), seats: b.seats, cctv: b.cctv, biometric: b.biometric, campusId: str(b.campusId, 60) || undefined, status: str(b.status, 10) }); return ok("Exam centre saved.");
      case "register": { const u = await prisma.user.findUnique({ where: { id: str(b.userId, 60) }, select: { id: true } }); if (!u || !(await inMyInstitute(me, u.id))) throw new Error("Not one of your people."); await registerEmployee(me, me, u.id, str(b.cnic, 20) || undefined); return ok("Registered."); }
      case "registerAll": {
        const ids = await myPeople(me);
        let n = 0; const miss: string[] = [];
        for (const id of ids) { try { if (await registerEmployee(me, me, id)) n++; } catch (e) { miss.push((e as Error).message.split(":")[0]); } }
        return ok(`${n} registered.${miss.length ? ` ${miss.length} without a valid CNIC on their profile${miss.length <= 8 ? `: ${miss.join(", ")}` : ""}.` : ""}`);
      }
      case "end": await endAffiliation(me, me, str(b.userId, 60)); return ok("Done.");
      case "sponsor": { const r = await sponsor(me, me, { name: str(b.name, 120), email: str(b.email, 160), cnic: str(b.cnic, 20), employer: str(b.employer, 120), designation: str(b.designation, 120), highestDegree: str(b.highestDegree, 160), hecAttestationNo: str(b.hecAttestationNo, 60), reason: str(b.reason, 500) }); return ok(`Account created. Username ${r.username}, temporary password ${r.temp} — give it to them privately; they must change it and set up MFA. Valid until ${r.expiresAt.toISOString().slice(0, 10)}.`); }
      case "renew": { const d = await renewSponsored(me, me, str(b.userId, 60)); return ok(`Renewed until ${d.toISOString().slice(0, 10)}.`); }
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg|undefined/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

async function inMyInstitute(chairmanId: string, userId: string) { return (await myPeople(chairmanId)).includes(userId); }
