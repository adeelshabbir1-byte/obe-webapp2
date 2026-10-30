import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { govScope } from "../../../../lib/accreditation/governance";
import { STANDARD_FIELDS, isBody } from "../../../../lib/accreditation/bodies";
import { withErrors } from "../../../../lib/apiHandler";

const MISSING = "Accreditation governance needs prisma/migration_accreditation_governance.sql to be run in Supabase first.";

// PUT { action: "bind", program, body }        — the Institute Head binds a program to its council.
// PUT { action: "standards", body, values }    — the Institute Head or OMC sets the thresholds for a council's programs.
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const s = user ? await govScope(user) : null;
  if (!user || !s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "bind") {
      if (!s.canBind) return NextResponse.json({ error: "Only the Institute Head binds programs to their council." }, { status: 403 });
      if (!isBody(b.body)) return NextResponse.json({ error: "Choose NCEAC, NBEAC, PEC or HEC." }, { status: 400 });
      const program = String(b.program || "").trim();
      const row = await prisma.departmentProgram.findUnique({ where: { chairmanId_degreeProgram: { chairmanId: s.chairmanId, degreeProgram: program } } });
      if (!row) return NextResponse.json({ error: "Give the program a department first (Departments page), then choose its council." }, { status: 400 });
      // A program in the middle of a visit keeps its council: the visit's forms were made for it.
      const open = await prisma.accreditationCycle.findFirst({ where: { chairmanId: s.chairmanId, program, status: "OPEN", NOT: { body: b.body } }, select: { title: true } });
      if (open) return NextResponse.json({ error: `“${open.title}” is open for this program under its current council. Close it before changing the council.` }, { status: 409 });
      await prisma.departmentProgram.update({ where: { id: row.id }, data: { accreditationBody: b.body, bodySetAt: new Date(), bodySetById: user.id } });
      await writeAuditLog({ actorUserId: user.id, action: "PROGRAM_COUNCIL_SET", entityType: "DepartmentProgram", entityId: row.id, metadata: { program, body: b.body, before: row.accreditationBody } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "standards") {
      if (!s.canSetStandards) return NextResponse.json({ error: "Only the Institute Head or the OMC sets the standards." }, { status: 403 });
      if (!isBody(b.body)) return NextResponse.json({ error: "Choose NCEAC, NBEAC, PEC or HEC." }, { status: 400 });
      const data: Record<string, number | null> = {};
      for (const f of STANDARD_FIELDS) {
        const raw = b.values?.[f.key];
        if (raw === undefined) continue;
        if (raw === null || raw === "") { data[f.key] = null; continue; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < f.min || n > f.max) return NextResponse.json({ error: `${f.label} must be between ${f.min} and ${f.max}.` }, { status: 400 });
        data[f.key] = f.key === "maxStudentsPerComputer" ? Math.round(n * 10) / 10 : Math.round(n);
      }
      const row = await prisma.accreditationStandard.upsert({
        where: { chairmanId_body: { chairmanId: s.chairmanId, body: b.body } },
        create: { chairmanId: s.chairmanId, body: b.body, ...data, updatedById: user.id },
        update: { ...data, updatedById: user.id },
      });
      await writeAuditLog({ actorUserId: user.id, action: "ACCREDITATION_STANDARDS_SET", entityType: "AccreditationStandard", entityId: row.id, metadata: { body: b.body, ...data } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}
export const PUT = withErrors(PUT_handler);
