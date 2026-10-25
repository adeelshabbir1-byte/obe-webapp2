import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";
import { writeAuditLog } from "../../../../lib/audit";
import { createStructure, setupPositions, ensureDegreeProgram, type Shape, type TFamily } from "../../../../lib/instituteSetup";
import { roleLabelOf } from "../../../../lib/orgChart";

export const dynamic = "force-dynamic";
const HEAD = ["Position", "Faculty / department / program", "Name", "Email (login)", "CNIC", "Phone", "Position ID (do not change)"];

async function ih() { const u = await getAuthenticatedUser(); return u && u.role === "CHAIRMAN" ? u : null; }

// GET — the management logins template: one row per position of the structure.
export async function GET() {
  const user = await ih(); if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ps = await setupPositions(user.id);
  const holders = await prisma.user.findMany({ where: { id: { in: ps.map((p) => p.holderId).filter((x): x is string => !!x).concat("none") } }, select: { id: true, name: true, email: true } });
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Management");
  ws.addRow(HEAD); ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2A4A" } }; });
  for (const p of ps) { const h = holders.find((x) => x.id === p.holderId); ws.addRow([roleLabelOf(p.role).replace(/ \(.*\)$/, ""), p.scope, h?.name || "", h?.email || "", "", "", p.id]); }
  [28, 40, 28, 32, 18, 16, 30].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(7).hidden = true;
  const help = wb.addWorksheet("Instructions");
  ["Fill Name and Email for each position you want to fill now; leave a row empty to fill it later.", "The same person can hold several positions: use the same email on each row.", "Each new person gets a login with the first password 12345678 and must change it on first sign-in.", "CNIC is kept on the profile and shown only to the Super Admin.", "Teachers are not added here — Deans, Chairmen and Program Leads add their own faculty."].forEach((t) => help.addRow([t]));
  help.getColumn(1).width = 110;
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="management-logins.xlsx"' } });
}

export async function POST(req: NextRequest) {
  const user = await ih(); if (!user) return NextResponse.json({ error: "Only the Institute Head sets up the institute." }, { status: 403 });
  const chairmanId = user.id;
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) return upload(req, chairmanId);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "structure") {
      const shape: Shape = ["FDP", "DP", "P"].includes(b.shape) ? b.shape : "FDP";
      const fams = (Array.isArray(b.families) ? b.families : []) as TFamily[];
      if (!fams.some((f) => f.on)) return NextResponse.json({ error: "Tick at least one faculty / discipline." }, { status: 400 });
      const m = await createStructure(chairmanId, shape, fams);
      return NextResponse.json({ ok: true, message: `Created ${shape === "FDP" ? `${m.faculties} faculty(ies), ` : ""}${m.departments} department(s), ${m.programs} program(s) and ${m.positions} position(s).${!m.positions && !m.programs ? " Everything already existed." : ""}` });
    }
    if (b.action === "program") { // after a Program Lead is placed: the degree program record their batches hang on
      const p = await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: String(b.program || "") } });
      const u = await prisma.user.findFirst({ where: { id: String(b.userId || ""), managedById: chairmanId } });
      if (p && u) await ensureDegreeProgram(u.id, p.degreeProgram);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 }); }
}

// Upload the filled template: dry run lists what will happen; otherwise logins are created (or found by email).
async function upload(req: NextRequest, chairmanId: string) {
  const fd = await req.formData();
  const file = fd.get("file"); const dry = fd.get("dryRun") === "1";
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose the filled file." }, { status: 400 });
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never); } catch { return NextResponse.json({ error: "That is not an Excel (.xlsx) file." }, { status: 400 }); }
  const ws = wb.worksheets[0];
  const ps = await setupPositions(chairmanId);
  const cell = (r: ExcelJS.Row, i: number) => { const v = r.getCell(i).value as unknown; const t = v && typeof v === "object" && "text" in (v as object) ? (v as { text: string }).text : v; return String(t ?? "").trim(); };
  const rows: { line: number; positionId: string; title: string; name: string; email: string; cnic: string; phone: string; status: string; userId?: string }[] = [];
  const all = await prisma.user.findMany({ select: { id: true, email: true, username: true, name: true, managedById: true, managedBy: { select: { managedById: true } } } });
  const byEmail = new Map(all.map((u) => [u.email.toLowerCase(), u]));
  const taken = new Set(all.map((u) => u.username.toLowerCase()));
  const planned = new Map<string, string>(); // email → id
  const seen = new Set<string>();
  ws?.eachRow((r, n) => {
    if (n === 1) return;
    const name = cell(r, 3), email = cell(r, 4).toLowerCase(), pid = cell(r, 7);
    const p = ps.find((x) => x.id === pid) || ps.find((x) => roleLabelOf(x.role).startsWith(cell(r, 1)) && x.scope === cell(r, 2));
    if (!name && !email) return;
    const row = { line: n, positionId: p?.id || "", title: p?.title || cell(r, 1), name, email, cnic: cell(r, 5), phone: cell(r, 6), status: "" };
    if (!p) row.status = "Position not found — download the template again.";
    else if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) row.status = "Give a name and a valid email.";
    else {
      const ex = byEmail.get(email);
      if (ex && ex.managedById !== chairmanId && ex.managedBy?.managedById !== chairmanId) row.status = `${email} belongs to another institute.`;
      else row.status = ex ? `Existing login (${ex.name})` : seen.has(email) ? "Same person as an earlier row" : "New login";
      seen.add(email);
    }
    rows.push(row);
  });
  if (!rows.length) return NextResponse.json({ error: "No filled rows — put a name and email against the positions." }, { status: 400 });
  const ok = rows.filter((r) => /^(New login|Existing login|Same person)/.test(r.status));
  if (dry) return NextResponse.json({ ok: true, dry: true, rows });
  const hash = await hashPassword("12345678");
  let created = 0;
  for (const r of ok) {
    const ex = byEmail.get(r.email);
    if (ex) { r.userId = ex.id; continue; }
    if (planned.has(r.email)) { r.userId = planned.get(r.email); continue; }
    const p = ps.find((x) => x.id === r.positionId)!;
    let username = r.email.split("@")[0].replace(/[^a-z0-9._-]/g, "") || "user", u = username, i = 1;
    while (taken.has(u)) u = `${username}${++i}`; username = u; taken.add(u);
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: r.email, username, name: r.name, passwordHash: hash, role: "INSTRUCTOR", managedById: chairmanId, departmentId: p.departmentId || null, mustChangePassword: true } as never });
    const profile = Object.fromEntries(Object.entries({ cnic: r.cnic || undefined, phone: r.phone || undefined }).filter(([, v]) => v));
    if (Object.keys(profile).length) await prisma.facultyProfile.upsert({ where: { userId: id }, create: { userId: id, ...profile } as never, update: profile as never }).catch(() => null);
    planned.set(r.email, id); r.userId = id; created++;
  }
  await writeAuditLog({ actorUserId: chairmanId, action: "MANAGEMENT_LOGINS_UPLOADED", entityType: "User", entityId: chairmanId, metadata: { rows: rows.length, created } }).catch(() => null);
  return NextResponse.json({ ok: true, rows, created, message: `${created} new login(s) created; ${ok.length - created} row(s) use an existing login. Now assign the positions below.` });
}
