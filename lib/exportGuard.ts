import ExcelJS from "exceljs";
import JSZip from "jszip";
import { CNIC_RE, maskCnic } from "./scrub";

// Every file download from the API passes through here (lib/apiHandler.ts): CNICs inside the file are masked
// (35202-•••••••-3), every export is written to the audit log (who, which file, how many rows), and a bulk export of
// student data (more than BULK_ROWS rows) needs the Program Lead role or above.
// The one exception is a regulator's upload file (NCEAC portal / AAS, HEMIS), which must carry the real CNIC: the
// Institute Head, Dean, HOD, Program Lead or Department Coordinator may ask for it with ?withCnic=1, and that is logged
// as CNIC_EXPORTED.

export const BULK_ROWS = 300;
export const LEAD_OR_ABOVE = ["SUPER_USER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "PROGRAM_LEAD"];
const REGULATOR_FILES = [/^\/api\/accreditation\/aas\b/, /^\/api\/accreditation\/nceac-portal\b/, /^\/api\/hemis\b/];
const STUDENT_HINT = /roll\s*(no|number)|student|registration\s*(no|number)|enrol/i;

type Who = { id: string; role: string } | null;

/** Masks every CNIC in a string; returns the new text and how many were found. */
export function maskText(s: string) { let n = 0; const out = s.replace(CNIC_RE, (m) => { n++; return maskCnic(m); }); return { out, n }; }

async function maskXlsx(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  let found = 0, rows = 0, student = false;
  wb.eachSheet((ws) => {
    rows += Math.max(0, ws.actualRowCount - 1);
    ws.eachRow((row, rn) => row.eachCell((cell) => {
      const v = cell.value;
      if (typeof v === "string") { const m = maskText(v); if (m.n) { cell.value = m.out; found += m.n; } if (rn <= 3 && STUDENT_HINT.test(v)) student = true; }
      else if (typeof v === "number" && /^\d{13}$/.test(String(v))) { cell.value = maskCnic(String(v)); found++; }
    }));
  });
  return { buf: found ? Buffer.from(await wb.xlsx.writeBuffer()) : buf, found, rows, student };
}
async function maskZip(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  let found = 0, rows = 0, student = false;
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir || !/\.(csv|json|txt|tsv)$/i.test(name)) continue;
    const t = await f.async("string");
    const m = maskText(t);
    rows += Math.max(0, t.split("\n").length - 1);
    if (/student/i.test(name) || STUDENT_HINT.test(t.slice(0, 400))) student = true;
    if (m.n) { found += m.n; zip.file(name, m.out); }
  }
  return { buf: found ? await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : buf, found, rows, student };
}

/** What kind of file a response is, if it is a download. */
export function downloadKind(res: Response): "xlsx" | "text" | "zip" | "pdf" | "other" | null {
  const cd = res.headers.get("content-disposition") || "";
  if (!/attachment|filename=/i.test(cd)) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const name = (/filename\*?="?([^";]+)/i.exec(cd)?.[1] || "").toLowerCase();
  if (ct.includes("spreadsheetml") || name.endsWith(".xlsx")) return "xlsx";
  if (ct.includes("zip") || name.endsWith(".zip")) return "zip";
  if (ct.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (ct.startsWith("text/") || ct.includes("json") || ct.includes("csv") || /\.(csv|json|txt|tsv)$/.test(name)) return "text";
  return "other";
}

async function whoIsAsking(): Promise<Who> {
  try {
    const { getSignedInUser } = await import("./session");
    const u = await getSignedInUser();
    if (u) return { id: u.id, role: u.role };
  } catch { /* not a staff request */ }
  try {
    const { getAuthenticatedStudent } = await import("./studentSession");
    const s = await getAuthenticatedStudent();
    if (s) return { id: s.id, role: "STUDENT" };
  } catch { /* no student session */ }
  return null;
}

export async function guardExport(res: Response, req: Request | undefined, who?: Who): Promise<Response> {
  const kind = downloadKind(res);
  if (!kind || !res.ok) return res;
  const url = req?.url ? new URL(req.url, "http://x") : null;
  const path = url?.pathname || "";
  const user = who === undefined ? await whoIsAsking() : who;
  const full = !!url && url.searchParams.get("withCnic") === "1" && REGULATOR_FILES.some((r) => r.test(path)) && !!user && LEAD_OR_ABOVE.includes(user.role);
  let buf = Buffer.from(await res.arrayBuffer());
  let found = 0, rows = 0, student = /student|roll|marks|result|transcript|attendance|enrol/i.test(path);
  try {
    if (kind === "xlsx" && !full) { const r = await maskXlsx(buf); buf = r.buf; found = r.found; rows = r.rows; student ||= r.student; }
    else if (kind === "zip" && !full) { const r = await maskZip(buf); buf = r.buf; found = r.found; rows = r.rows; student ||= r.student; }
    else if (kind === "text") { const t = buf.toString("utf8"); rows = Math.max(0, t.split("\n").length - 1); student ||= STUDENT_HINT.test(t.slice(0, 600)); if (!full) { const m = maskText(t); if (m.n) { buf = Buffer.from(m.out, "utf8"); found = m.n; } } }
  } catch { /* unreadable file: passed on as it is */ }
  if (student && rows > BULK_ROWS && user && user.role !== "STUDENT" && !LEAD_OR_ABOVE.includes(user.role)) {
    return new Response(JSON.stringify({ error: `A bulk export of student data (${rows} rows) needs the Program Lead role or above.` }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  try {
    const { writeAuditLog } = await import("./audit");
    const file = (/filename\*?="?([^";]+)/i.exec(res.headers.get("content-disposition") || "")?.[1] || "").slice(0, 120);
    await writeAuditLog({ actorUserId: user && user.role !== "STUDENT" ? user.id : null, action: full ? "CNIC_EXPORTED" : "DATA_EXPORTED", entityType: "Export", entityId: path.slice(0, 120), metadata: { file, kind, rows, studentData: student, cnicMasked: full ? 0 : found, by: user?.role === "STUDENT" ? `student:${user.id}` : undefined } as never });
  } catch { /* the export itself still works */ }
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(new Uint8Array(buf), { status: res.status, headers });
}
