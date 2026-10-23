import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import { ldb, LIB_HINT, duesOf, policyOf, fineOf, type Title } from "../../../lib/library";
import { ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Student: the books I have, when they are due, fines, reservations — and the catalogue to search and reserve.
export default async function StudentLibrary({ searchParams }: { searchParams: { q?: string } }) {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  if (st.mustChangePassword) redirect("/student/change-password");
  const H = (await prisma.student.findUnique({ where: { id: st.id }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } }))?.batch.coordinator?.managedById || "";
  const q = (searchParams.q || "").trim();
  let missing = false, titles: Title[] = [], holds: { id: string; titleId: string; status: string; readyAt: Date | null }[] = [];
  const d = await duesOf("STUDENT", st.id);
  const p = await policyOf(H);
  const avail = new Map<string, number>(), names = new Map<string, string>();
  try {
    holds = await ldb.libraryHold.findMany({ where: { memberType: "STUDENT", memberId: st.id, status: { in: ["WAITING", "READY"] } } });
    if (q) titles = await ldb.libraryTitle.findMany({ where: { chairmanId: H, OR: [{ title: { contains: q, mode: "insensitive" } }, { authors: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] }, orderBy: { title: "asc" }, take: 40 });
    const ids = [...titles.map((t) => t.id), ...d.loans.map((l) => l.titleId), ...holds.map((h) => h.titleId)];
    for (const c of (await ldb.libraryCopy.findMany({ where: { titleId: { in: ids.concat(["none"]) }, status: "AVAILABLE" }, select: { titleId: true } })) as { titleId: string }[]) avail.set(c.titleId, (avail.get(c.titleId) || 0) + 1);
    for (const t of (await ldb.libraryTitle.findMany({ where: { id: { in: ids.concat(["none"]) } }, select: { id: true, title: true } })) as { id: string; title: string }[]) names.set(t.id, t.title);
  } catch { missing = true; }
  const open = d.loans.filter((l) => !l.returnedAt);
  const owed = d.loans.filter((l) => l.returnedAt && fineOf(l, p.finePerDay) > l.finePaid);

  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Library</h1>
        <p className="small-note" style={{ marginBottom: 10 }}>You may borrow {p.studentLimit} book(s) for {p.studentDays} days and renew up to {p.maxRenewals} time(s). A late book costs Rs {p.finePerDay} a day. Books or fines still due stop your library clearance (degree, leaving or transfer).</p>
        {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{LIB_HINT}</p></div>}
        {d.fines > 0 && <div className="card" style={{ background: "#FDECEA", borderColor: "#B3261E" }}><b>Fines due: Rs {d.fines.toLocaleString("en-PK")}</b> — pay at the library counter.</div>}

        <h2 style={{ fontSize: 17, margin: "10px 0 6px" }}>My books ({open.length})</h2>
        <div className="card">
          {open.length === 0 && <p className="small-note" style={{ margin: 0 }}>No books out.</p>}
          {open.map((l) => { const late = new Date(l.dueAt) < new Date(); return (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #eee" }}>
              <span><b>{names.get(l.titleId)}</b> — due <b style={{ color: late ? "#B3261E" : undefined }}>{day(l.dueAt)}</b>{late ? ` (fine so far Rs ${fineOf(l, p.finePerDay)})` : ""}{l.renewals ? ` · renewed ${l.renewals}×` : ""}</span>
              {!late && l.renewals < p.maxRenewals && <ActionButton url="/api/student/library" body={{ action: "renew", loanId: l.id }} label="Renew" className="btn btn-secondary btn-sm" />}
            </div>
          ); })}
          {owed.map((l) => <div key={l.id} className="small-note" style={{ margin: "6px 0 0", color: "#B3261E" }}>{names.get(l.titleId)}: fine Rs {fineOf(l, p.finePerDay) - l.finePaid} unpaid</div>)}
        </div>

        {holds.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>My reservations</h2>
            <div className="card">{holds.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" }}>
                <span>{names.get(h.titleId)} — {h.status === "READY" ? <b style={{ color: "#1E6B3A" }}>ready at the counter (collect within {p.holdDays} day(s))</b> : "waiting for a copy"}</span>
                <ActionButton url="/api/student/library" body={{ action: "cancelHold", holdId: h.id }} label="Cancel" className="btn btn-secondary btn-sm" />
              </div>
            ))}</div>
          </>
        )}

        <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>Find a book</h2>
        <form method="get" className="card" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input name="q" className="input" defaultValue={q} placeholder="title, author or subject" style={{ flex: "1 1 220px" }} />
          <button className="btn btn-brass btn-sm">Search</button>
        </form>
        {q && (
          <div className="card">
            {titles.length === 0 && <p className="small-note" style={{ margin: 0 }}>Nothing found.</p>}
            {titles.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <span><b>{t.title}</b><span className="small-note"> {[t.authors, t.year, t.callNumber].filter(Boolean).join(" · ")}</span></span>
                {t.kind !== "PRINT" ? (t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open online</a> : <span className="small-note">online</span>)
                  : avail.get(t.id) ? <span style={{ color: "#1E6B3A", fontWeight: 700, fontSize: 13 }}>{avail.get(t.id)} on the shelf</span>
                  : <ActionButton url="/api/student/library" body={{ action: "reserve", titleId: t.id }} label="Reserve" className="btn btn-secondary btn-sm" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
