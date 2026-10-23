import { prisma } from "./db";
import { programsFor } from "./quality";
import type { QField } from "./qaOffice";

type U = { id: string; role: string; managedById: string | null };
/** Turns the register's field list into ActionForm fields, with the institute's programs, departments and Program Leads as choices. */
export async function formFields(user: U, cid: string, fields: QField[]) {
  const [progs, depts, leads] = await Promise.all([
    programsFor(user).catch(() => []), prisma.department.findMany({ where: { chairmanId: cid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { managedById: cid, role: "PROGRAM_COORDINATOR" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const opts = { program: Array.from(new Set(progs.map((p) => p.degreeProgram))).map((p) => [p, p] as [string, string]), department: depts.map((d) => [d.id, d.name] as [string, string]), lead: leads.map((l) => [l.id, l.name] as [string, string]) };
  const deptName = new Map(depts.map((d) => [d.id, d.name])), leadName = new Map(leads.map((l) => [l.id, l.name]));
  const form = fields.map((f) => {
    const t = f.type || "text";
    if (t === "program" || t === "department" || t === "lead") return { name: f.key, label: f.label + (f.required ? " *" : ""), type: "select" as const, options: [["", "—"] as [string, string], ...opts[t]] };
    if (t === "select") return { name: f.key, label: f.label + (f.required ? " *" : ""), type: "select" as const, options: [["", "—"] as [string, string], ...(f.options || [])] };
    return { name: f.key, label: f.label + (f.required ? " *" : ""), type: t as "text" | "textarea" | "number" | "date", ...(t === "textarea" ? { full: true } : {}) };
  });
  const show = (f: QField, v: string) => (f.type === "department" ? deptName.get(v) || "" : f.type === "lead" ? leadName.get(v) || "" : f.type === "select" ? f.options?.find((o) => o[0] === v)?.[1] || v : v);
  return { form, show };
}
