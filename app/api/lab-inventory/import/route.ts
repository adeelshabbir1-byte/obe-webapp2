import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { logChange } from "../../../../lib/changeLog";
import { labScope } from "../../../../lib/resources";
import { readWorkbookGrids, findHeader, toInt, toText, toDate } from "../../../../lib/excelRead";

export const maxDuration = 60;

// Reads the file the Download gives (sheet "Labs" and sheet "PC specifications").
// Labs are matched by name: existing ones are updated, new ones added. For every lab named on the PC sheet its
// PC-specification lines are replaced by the lines in the file. Nothing else is deleted.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "only the Lab Manager or the Institute Head can change lab data" }, { status: 403 });
  const file = (await req.formData().catch(() => null))?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file" }, { status: 400 });
  let sheets;
  try { sheets = await readWorkbookGrids(file); } catch { return NextResponse.json({ error: "could not read that file" }, { status: 400 }); }

  type Found = { grid: string[][]; hi: number; col: (re: RegExp) => number };
  let labSheet = null as Found | null;
  let pcSheet = null as Found | null;
  for (const s of sheets) {
    const pc = findHeader(s.grid, [/^lab$/, /^quantity$/]);
    const lb = findHeader(s.grid, [/^lab$/, /^computers$/]);
    if (pc && !pcSheet) pcSheet = { grid: s.grid, ...pc };
    else if (lb && !labSheet) labSheet = { grid: s.grid, ...lb };
  }
  if (!labSheet && !pcSheet) return NextResponse.json({ error: "no sheet with a Lab column plus Computers (labs) or Quantity (PC specifications) found - download the lab file and edit that" }, { status: 400 });

  const depts = await prisma.department.findMany({ where: { chairmanId: scope.chairmanId }, select: { id: true, name: true } });
  const deptByName = new Map(depts.map((d) => [d.name.trim().toLowerCase(), d.id]));
  const allLabs = await prisma.labInfo.findMany({ where: { chairmanId: scope.chairmanId } });
  const byName = new Map(allLabs.map((l) => [l.name.trim().toLowerCase(), l]));
  const inScope = (departmentId: string | null) => !scope.departmentIds || (!!departmentId && scope.departmentIds.includes(departmentId));
  const warnings: string[] = [];
  let added = 0, updated = 0, specLines = 0;
  const cell = (r: string[], i: number) => (i >= 0 ? r[i] : undefined);

  if (labSheet) {
    const c = { name: labSheet.col(/^lab$/), dept: labSheet.col(/^department$/), loc: labSheet.col(/^location$/), seats: labSheet.col(/^seats$/), comp: labSheet.col(/^computers$/), work: labSheet.col(/^working$/),
      net: labSheet.col(/^internet/), audit: labSheet.col(/^last stock check|^last audit/), sw: labSheet.col(/^software$/), eq: labSheet.col(/^other equipment$|^equipment$/) };
    for (const r of labSheet.grid.slice(labSheet.hi + 1)) {
      const name = toText(cell(r, c.name), 120);
      if (!name) continue;
      const existing = byName.get(name.toLowerCase());
      let departmentId: string | null;
      if (scope.departmentIds) departmentId = scope.departmentIds[0] || null;
      else {
        const dn = (cell(r, c.dept) || "").trim().toLowerCase();
        if (!dn || dn === "common") departmentId = existing?.departmentId ?? null;
        else if (deptByName.has(dn)) departmentId = deptByName.get(dn)!;
        else { warnings.push(`${name}: department "${cell(r, c.dept)}" not found, row skipped`); continue; }
      }
      if (existing && !inScope(existing.departmentId)) { warnings.push(`${name}: belongs to another department, skipped`); continue; }
      const computers = toInt(cell(r, c.comp)) ?? 0;
      const data = {
        name, departmentId, location: toText(cell(r, c.loc), 160), seats: toInt(cell(r, c.seats)) ?? 0, computers, computersWorking: Math.min(toInt(cell(r, c.work)) ?? 0, computers),
        internetMbps: toInt(cell(r, c.net)), lastAudit: toDate(cell(r, c.audit)), software: toText(cell(r, c.sw)), equipment: toText(cell(r, c.eq)), updatedById: user.id,
      };
      if (existing) { await prisma.labInfo.update({ where: { id: existing.id }, data }); byName.set(name.toLowerCase(), { ...existing, ...data }); updated++; }
      else { const made = await prisma.labInfo.create({ data: { chairmanId: scope.chairmanId, ...data } }); byName.set(name.toLowerCase(), made); added++; }
    }
  }

  if (pcSheet) {
    const c = { lab: pcSheet.col(/^lab$/), qty: pcSheet.col(/^quantity$/), mm: pcSheet.col(/^make/), cpu: pcSheet.col(/^processor$/), ram: pcSheet.col(/^ram/), st: pcSheet.col(/^storage$/),
      gpu: pcSheet.col(/^graphics$|^gpu$/), os: pcSheet.col(/^operating system$|^os$/), yr: pcSheet.col(/^bought in$|^purchase year$/), notes: pcSheet.col(/^notes$/) };
    const perLab = new Map<string, any[]>();
    for (const r of pcSheet.grid.slice(pcSheet.hi + 1)) {
      const ln = toText(cell(r, c.lab), 120);
      if (!ln) continue;
      const lab = byName.get(ln.toLowerCase());
      if (!lab || !inScope(lab.departmentId)) { warnings.push(`PC line for "${ln}" skipped: no such lab in your scope`); continue; }
      const quantity = toInt(cell(r, c.qty));
      if (!quantity) { warnings.push(`PC line for "${ln}" skipped: quantity must be 1 or more`); continue; }
      const ram = toInt(cell(r, c.ram)), yr = toInt(cell(r, c.yr));
      const list = perLab.get(lab.id) || [];
      list.push({ chairmanId: scope.chairmanId, labId: lab.id, quantity, makeModel: toText(cell(r, c.mm), 200), processor: toText(cell(r, c.cpu), 200), ramGb: ram && ram <= 4096 ? ram : null,
        storage: toText(cell(r, c.st), 200), gpu: toText(cell(r, c.gpu), 200), os: toText(cell(r, c.os), 200), purchaseYear: yr && yr >= 1990 && yr <= 2100 ? yr : null, notes: toText(cell(r, c.notes), 500) });
      perLab.set(lab.id, list);
    }
    const ids = Array.from(perLab.keys());
    if (ids.length) {
      await prisma.$transaction([
        prisma.labComputerSpec.deleteMany({ where: { labId: { in: ids }, chairmanId: scope.chairmanId } }),
        prisma.labComputerSpec.createMany({ data: Array.from(perLab.values()).flat() }),
      ]);
      specLines = Array.from(perLab.values()).reduce((n, l) => n + l.length, 0);
    }
  }

  await logChange(scope.chairmanId, "LABS", `Lab data imported from Excel: ${added} labs added, ${updated} updated, ${specLines} PC lines`, user.id);
  return NextResponse.json({ ok: true, message: `${added} lab(s) added, ${updated} updated, ${specLines} PC specification line(s) saved.`, warnings: warnings.slice(0, 8) });
}
