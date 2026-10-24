import { redirect } from "next/navigation";
import Sources from "../../components/regulations/Sources";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { prisma } from "../../lib/db";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT, memberOf, rulesOn, residencyOf, NOC_KINDS, nocState, centreGaps, myPeople, normCnic, maskCnic, type Noc, type Centre, type Affiliation } from "../../lib/consortium";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium" };

const STATE_COL: Record<string, string> = { VALID: "#2E7D32", EXPIRING: "#B26A00", EXPIRED: "#C62828" };

// Institute Head: joining the consortium (free), the university's residency rules, its HEC NOCs, exam centres,
// registering its faculty under their CNIC, and industry experts it vouches for.
export default async function ConsortiumPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role === "SUPER_USER") redirect("/admin/consortium");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (user.role !== "CHAIRMAN") return shell(<div className="card">The Institute Head manages your university&apos;s consortium membership. Visiting courses and teaching posts open in the next phases.</div>);
  const m = await memberOf(user.id).catch(() => undefined);
  if (m === undefined) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  const { rules, label } = await rulesOn();
  const head = (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Consortium</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Universities on OBEHUB offer each other joint degree programmes, visiting and ODL courses for students, and teaching posts for visiting faculty. Joining is free. Rules in force: <b>{label}</b> — HEC minimums kept by the OBEHUB Super Admin.</p>
    </>
  );
  const applyForm = (submit: string, collapsed = false) => (
    <ActionForm showMessage url="/api/consortium" fixed={{ action: "apply" }} submit={submit} collapsed={collapsed} openLabel="Edit university details…"
      initial={{ country: m?.country || "PK", city: m?.city || "", website: m?.website || "", hecRecognized: m?.hecRecognized || false, contactName: m?.contactName || user.name, contactEmail: m?.contactEmail || "", note: m?.note || "" }}
      fields={[{ name: "city", label: "City" }, { name: "website", label: "Website", width: 220 }, { name: "contactName", label: "Contact person" }, { name: "contactEmail", label: "Contact email", width: 220 },
        { name: "country", label: "Country", type: "select", options: [["PK", "Pakistan"], ["AE", "UAE"], ["SA", "Saudi Arabia"], ["GB", "United Kingdom"], ["US", "United States"], ["MY", "Malaysia"], ["TR", "Türkiye"], ["CN", "China"]] },
        { name: "hecRecognized", label: "We are on HEC's list of recognised universities", type: "checkbox" }, { name: "note", label: "Programmes you want to offer jointly, or a note", type: "textarea" }]} />
  );
  if (!m || m.status === "DECLINED") return shell(<>{head}
    <div className="card"><h3 style={{ marginTop: 0 }}>Join the consortium</h3>
      {m?.decisionNote && <p className="err">Your earlier application was declined: {m.decisionNote}</p>}
      <ol className="small-note" style={{ marginTop: 0 }}><li>Apply here — free.</li><li>The Super Admin checks HEC recognition and admits you.</li><li>Add your HEC NOCs (ODL recognition, joint-degree NOCs) and exam centres, and register your faculty by CNIC.</li><li>Then equalise courses with partner universities and open visiting courses and teaching posts.</li></ol>
      {applyForm("Apply to join")}</div></>);

  const [nocs, centres, campuses, ids] = await Promise.all([
    cdb.consortiumNoc.findMany({ where: { chairmanId: user.id }, orderBy: { createdAt: "desc" } }) as Promise<Noc[]>,
    cdb.examCentre.findMany({ where: { chairmanId: user.id }, orderBy: { name: "asc" } }) as Promise<Centre[]>,
    (prisma as unknown as Record<string, any>).campus.findMany({ where: { chairmanId: user.id }, orderBy: { name: "asc" } }).catch(() => []) as Promise<{ id: string; name: string }[]>,
    myPeople(user.id),
  ]);
  const [people, profiles, affs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true, email: true }, orderBy: { name: "asc" } }),
    prisma.facultyProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, cnic: true } }),
    cdb.consortiumAffiliation.findMany({ where: { chairmanId: user.id } }) as Promise<Affiliation[]>,
  ]);
  const cnicOf = new Map(profiles.map((p) => [p.userId, normCnic(p.cnic)]));
  const affOf = new Map(affs.map((a) => [a.userId, a]));
  const sponsored = affs.filter((a) => a.kind === "SPONSORED");
  const sUsers = await prisma.user.findMany({ where: { id: { in: sponsored.map((a) => a.userId) } }, select: { id: true, name: true, email: true } });
  const res = residencyOf(m);
  const activeIds = ((await cdb.consortiumMember.findMany({ where: { status: "ACTIVE" }, select: { chairmanId: true } })) as { chairmanId: string }[]).map((x) => x.chairmanId).filter((x) => x !== user.id);
  const others = (await cdb.examCentre.findMany({ where: { chairmanId: { in: activeIds }, status: "ACTIVE" }, orderBy: [{ city: "asc" }, { name: "asc" }] })) as Centre[];
  const approvedSet = new Set(((await cdb.consortiumCentreApproval.findMany({ where: { chairmanId: user.id, status: "APPROVED" } }).catch(() => [])) as { centreId: string }[]).map((x) => x.centreId));
  const otherHeads = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(others.map((c) => c.chairmanId))) } }, select: { id: true, instituteName: true, name: true } });
  const uniName = (id: string) => otherHeads.find((h) => h.id === id)?.instituteName || otherHeads.find((h) => h.id === id)?.name || "—";
  const registered = people.filter((p) => affOf.get(p.id)?.status === "ACTIVE").length;
  const odl = nocs.filter((n) => n.kind === "ODL_INSTITUTIONAL").map((n) => nocState(n)).find((s) => s.state !== "EXPIRED");
  const status = m.status === "ACTIVE" ? <b style={{ color: "#2E7D32" }}>Member</b> : m.status === "SUSPENDED" ? <b style={{ color: "#C62828" }}>Suspended{m.decisionNote ? ` — ${m.decisionNote}` : ""}</b> : <b style={{ color: "#B26A00" }}>Application waiting for the Super Admin</b>;

  return shell(<>{head}
    <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
      <span>{status}</span>
      <span>ODL recognition: {odl ? <b style={{ color: STATE_COL[odl.state] }}>{odl.label}</b> : <b style={{ color: "#C62828" }}>none — needed to offer ODL courses</b>}</span>
      <span><b>{registered}</b> / {people.length} faculty registered by CNIC</span>
      <span><b>{centres.filter((c) => c.status === "ACTIVE").length}</b> exam centre(s)</span>
      {applyForm("Save details", true)}
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>HEC NOCs and recognitions</h3>
      <p className="small-note" style={{ marginTop: 0 }}>ODL courses need a valid institutional ODL NOC (HEC recognises ODL for up to {String(rules.odlNocMaxYears)} years). A joint degree needs HEC&apos;s NOC for that programme before launch. Listings stop automatically when a NOC expires. <Sources targets={["rule:odlNocRequired", "rule:odlNocMaxYears", "rule:jointNocRequired"]} /></p>
      {nocs.length > 0 && <table style={{ fontSize: 13 }}><thead><tr><th>For</th><th>Number</th><th>Programme</th><th>Status</th><th></th></tr></thead><tbody>{nocs.map((n) => { const s = nocState(n); return (
        <tr key={n.id}><td>{NOC_KINDS.find(([k]) => k === n.kind)?.[1] || n.kind}</td><td><b>{n.number}</b>{n.issuedOn ? <div className="small-note">issued {n.issuedOn.toISOString().slice(0, 10)}</div> : null}</td><td>{n.programme || "—"}</td><td style={{ color: STATE_COL[s.state], fontWeight: 700 }}>{s.label}</td>
          <td><ActionButton showMessage url="/api/consortium" body={{ action: "nocDelete", id: n.id }} label="Remove" className="btn btn-secondary btn-sm" confirmText="Remove this NOC?" /></td></tr>); })}</tbody></table>}
      <ActionForm showMessage url="/api/consortium" fixed={{ action: "noc" }} submit="Add NOC" collapsed openLabel="+ Add a NOC"
        fields={[{ name: "kind", label: "For", type: "select", width: 300, options: [["", "—"], ...NOC_KINDS] }, { name: "number", label: "Number / notification no.", width: 220 }, { name: "programme", label: "Programme (if for one)", width: 220 }, { name: "issuedOn", label: "Issued", type: "date" }, { name: "expiresOn", label: "Expires", type: "date" }, { name: "note", label: "Note", width: 260 }]} />
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Exam centres</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Where consortium students may sit final exams: your campuses or centres you run. {rules.centreBothApprove ? "A student can use a centre only when both their own university and the course's university approve it (next phases)." : ""} HEC&apos;s ODL policy asks for invigilation by university faculty, CCTV kept {String(rules.recordingYears)} years, and biometric / ID attendance. <Sources targets={["page:exams", "rule:examProctored", "rule:recordingYears"]} /></p>
      {centres.length > 0 && <table style={{ fontSize: 13 }}><thead><tr><th>Centre</th><th>Seats</th><th>Meets the exam rules?</th><th></th></tr></thead><tbody>{centres.map((c) => { const g = centreGaps(c, rules); return (
        <tr key={c.id} style={{ opacity: c.status === "CLOSED" ? 0.5 : 1 }}><td><b>{c.name}</b><div className="small-note">{[c.city, c.address, campuses.find((x) => x.id === c.campusId)?.name].filter(Boolean).join(" · ")}</div></td><td>{c.seats}</td>
          <td style={{ color: g.length ? "#B26A00" : "#2E7D32" }}>{g.length ? g.join("; ") : "Yes — CCTV and biometric attendance"}</td>
          <td><ActionForm showMessage url="/api/consortium" fixed={{ action: "centre", id: c.id }} submit="Save" collapsed openLabel="Edit" initial={{ ...c }} fields={[{ name: "name", label: "Name" }, { name: "city", label: "City" }, { name: "seats", label: "Seats", type: "number", width: 80 }, { name: "cctv", label: "CCTV", type: "checkbox" }, { name: "biometric", label: "Biometric / ID", type: "checkbox" }, { name: "status", label: "Status", type: "select", options: [["ACTIVE", "Open"], ["CLOSED", "Closed"]] }]} /></td></tr>); })}</tbody></table>}
      <ActionForm showMessage url="/api/consortium" fixed={{ action: "centre" }} submit="Add centre" collapsed openLabel="+ Add an exam centre" initial={{ cctv: true, biometric: true }}
        fields={[{ name: "name", label: "Name (e.g. Main Campus Exam Hall)", width: 260 }, ...(campuses.length ? [{ name: "campusId", label: "Campus", type: "select" as const, options: [["", "—"] as [string, string], ...campuses.map((x) => [x.id, x.name] as [string, string])] }] : []), { name: "city", label: "City" }, { name: "address", label: "Address", width: 260 }, { name: "seats", label: "Seats", type: "number", width: 80 }, { name: "cctv", label: "CCTV with recording", type: "checkbox" }, { name: "biometric", label: "Biometric / ID attendance", type: "checkbox" }]} />
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Other universities&apos; centres your students may use</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Your students sit a consortium exam only at a centre {rules.centreBothApprove ? "both you and the course's university approve" : "the course's university lists"}. Your own centres are always approved.</p>
      {!others.length ? <p className="small-note" style={{ margin: 0 }}>No other member has added exam centres yet.</p> : <table style={{ fontSize: 13 }}><tbody>{others.map((c) => { const on = approvedSet.has(c.id); const g = centreGaps(c, rules); return (
        <tr key={c.id}><td><b>{c.name}</b><div className="small-note">{uniName(c.chairmanId)}{c.city ? ` · ${c.city}` : ""} · {c.seats} seats</div></td><td className="small-note" style={{ color: g.length ? "#B26A00" : "#2E7D32" }}>{g.length ? g.join("; ") : "CCTV and biometric attendance"}</td>
          <td style={{ fontWeight: 700, color: on ? "#2E7D32" : "#6B7177" }}>{on ? "Approved" : "Not approved"}</td>
          <td><ActionButton showMessage url="/api/consortium/exams" body={{ action: "approve", centreId: c.id, on: !on }} label={on ? "Withdraw approval" : "Approve"} className={on ? "btn btn-secondary btn-sm" : "btn btn-brass btn-sm"} /></td></tr>); })}</tbody></table>}
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Your university&apos;s own rules</h3>
      <p className="small-note" style={{ marginTop: 0 }}>For degrees your university awards. The consortium minimum is {String(rules.minHomeResidencyPct)}% of credits{rules.capstoneAtHome ? " and the capstone at home" : ""}; yours can be stricter. <Sources targets={["rule:minHomeResidencyPct", "rule:capstoneAtHome"]} /></p>
      <ActionForm showMessage url="/api/consortium" fixed={{ action: "residency" }} submit="Save residency rules"
        initial={{ minHomeResidencyPct: res.minHomeResidencyPct ?? rules.minHomeResidencyPct, capstoneAtHome: res.capstoneAtHome || rules.capstoneAtHome === true, majorsAtHome: res.majorsAtHome, visitingNoc: res.visitingNoc }}
        fields={[{ name: "minHomeResidencyPct", label: "Credits at our university, at least (%)", type: "number", width: 120 }, { name: "capstoneAtHome", label: "Capstone / FYP at our university", type: "checkbox" }, { name: "majorsAtHome", label: "All major core courses at our university", type: "checkbox" }, { name: "visitingNoc", label: "Our faculty need our NOC to teach at another university", type: "checkbox" }]} />
    </div>

    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Your faculty — one identity by CNIC</h3>
        <ActionButton showMessage url="/api/consortium" body={{ action: "registerAll" }} label="Register everyone with a CNIC on their profile" />
      </div>
      <p className="small-note">Only people your university vouches for can apply for teaching posts at other universities, and no one can sign themselves up. Each person is one identity across the platform: someone teaching at two universities is the same person with two affiliations. The CNIC is used only for that and shown only to the Super Admin.</p>
      <table style={{ fontSize: 13 }}><thead><tr><th>Name</th><th>CNIC on profile</th><th>Consortium</th><th></th></tr></thead><tbody>{people.map((p) => { const a = affOf.get(p.id); const c = cnicOf.get(p.id); return (
        <tr key={p.id}><td>{p.name}<div className="small-note">{p.role.toLowerCase().replace(/_/g, " ")}</div></td><td className="small-note">{c ? maskCnic(c) : "—"}</td>
          <td style={{ color: a?.status === "ACTIVE" ? "#2E7D32" : "#6B7177", fontWeight: a?.status === "ACTIVE" ? 700 : 400 }}>{a?.status === "ACTIVE" ? "Registered" : a ? a.status.toLowerCase() : "Not registered"}</td>
          <td>{a?.status === "ACTIVE" ? <ActionButton showMessage url="/api/consortium" body={{ action: "end", userId: p.id }} label="Employment ended" className="btn btn-secondary btn-sm" confirmText={`${p.name} no longer works here? Other universities will no longer see your university vouching for them.`} />
            : <ActionForm showMessage url="/api/consortium" fixed={{ action: "register", userId: p.id }} submit="Register" collapsed openLabel="Register" initial={{ cnic: "" }} fields={[{ name: "cnic", label: c ? "CNIC (leave empty to use the profile's)" : "CNIC", placeholder: "12345-1234567-1", width: 170 }]} />}</td></tr>); })}</tbody></table>
      {!people.length && <p className="small-note">No faculty accounts yet.</p>}
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Industry experts your university vouches for</h3>
      {!rules.industryApplicants ? <p className="small-note" style={{ margin: 0 }}>Not open yet. The Super Admin switches industry experts on in the rules book. Until then only faculty of member universities take part.</p> : <>
        <p className="small-note" style={{ marginTop: 0 }}>An industry expert can teach in the consortium only through a university that vouches for them. You create their account; your university is shown as their sponsor. It lasts {String(rules.sponsoredDays)} days unless you renew it, and you can revoke it at any time. At most {String(rules.sponsorCap)} active at once.</p>
        {sponsored.length > 0 && <table style={{ fontSize: 13 }}><thead><tr><th>Name</th><th>Employer</th><th>Why we vouch</th><th>Valid until</th><th></th></tr></thead><tbody>{sponsored.map((a) => { const u = sUsers.find((x) => x.id === a.userId); const lapsed = a.status !== "ACTIVE" || (a.expiresAt && a.expiresAt < new Date()); return (
          <tr key={a.userId} style={{ opacity: lapsed ? 0.6 : 1 }}><td>{u?.name}<div className="small-note">{u?.email}</div></td><td>{a.employer}{a.designation ? <div className="small-note">{a.designation}</div> : null}</td><td className="small-note">{a.reason}</td>
            <td style={{ color: lapsed ? "#C62828" : undefined }}>{a.status === "REVOKED" ? "revoked" : a.expiresAt?.toISOString().slice(0, 10)}</td>
            <td style={{ whiteSpace: "nowrap" }}><ActionButton showMessage url="/api/consortium" body={{ action: "renew", userId: a.userId }} label="Renew" className="btn btn-secondary btn-sm" />{" "}{a.status === "ACTIVE" && <ActionButton showMessage url="/api/consortium" body={{ action: "end", userId: a.userId }} label="Revoke" className="btn btn-secondary btn-sm" confirmText="Revoke this account? They can no longer sign in." />}</td></tr>); })}</tbody></table>}
        <ActionForm showMessage url="/api/consortium" fixed={{ action: "sponsor" }} submit="Create sponsored account" collapsed openLabel="+ Vouch for an industry expert"
          fields={[{ name: "name", label: "Full name" }, { name: "email", label: "Email", width: 220 }, { name: "cnic", label: "CNIC", placeholder: "12345-1234567-1", width: 170 }, { name: "employer", label: "Current employer" }, { name: "designation", label: "Designation" }, { name: "highestDegree", label: "Highest degree (e.g. MS Computer Science, NUST)", width: 280 }, { name: "hecAttestationNo", label: "HEC attestation no." }, { name: "reason", label: "Why your university vouches for this person", type: "textarea" }]} />
      </>}
    </div>
    <p className="small-note"><Link href="/consortium/agreements">Agreements and course equivalence →</Link> · <Link href="/consortium/offerings">Courses open to the consortium →</Link> · <Link href="/consortium/applications">Consortium students →</Link> · <Link href="/consortium/vacancies">Visiting faculty posts →</Link> · <Link href="/consortium/teaching">Teaching posts elsewhere →</Link> · <Link href="/consortium/exams">Consortium exams →</Link> · <Link href="/catalog">Public catalog →</Link></p>
  </>);
}
