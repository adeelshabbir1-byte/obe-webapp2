import { allStored, saveSetting, clearSetting } from "./scopedSettings";

// Who sets the minutes format (Adeel prompt §24.5): the Institute Head (or the Registrar / QEC as his delegate) sets the
// institute default; each committee's Convener can adapt it for his committee; otherwise the default applies. Stored as
// ScopedSetting "minutes.template" at INSTITUTE / COMMITTEE scope. Changes apply to future minutes only.
export type Template = { sections: string[]; signatures: string[]; footer: string };
export const DEFAULT: Template = { sections: [], signatures: ["Convener", "Secretary"], footer: "" };
const KEY = "minutes.template";
const parse = (v: string | undefined): Template | null => { try { const t = v ? JSON.parse(v) : null; return t ? { sections: (t.sections || []).map(String).slice(0, 12), signatures: (t.signatures || []).map(String).slice(0, 5), footer: String(t.footer || "").slice(0, 200) } : null; } catch { return null; } };

export async function templateFor(chairmanId: string, committeeId?: string | null) {
  const rows = await allStored(chairmanId).catch(() => []);
  const own = committeeId ? parse(rows.find((r) => r.scopeType === "COMMITTEE" && r.scopeId === committeeId && r.key === KEY)?.value) : null;
  const inst = parse(rows.find((r) => r.scopeType === "INSTITUTE" && r.key === KEY)?.value);
  return own || inst || DEFAULT;
}
export async function saveTemplate(chairmanId: string, scope: { committeeId?: string | null }, t: Template | null, byId: string) {
  if (!t) { await clearSetting(chairmanId, scope.committeeId ? ("COMMITTEE" as never) : "INSTITUTE", scope.committeeId || chairmanId, KEY); return; }
  await saveSetting(chairmanId, scope.committeeId ? ("COMMITTEE" as never) : "INSTITUTE", scope.committeeId || chairmanId, KEY, JSON.stringify(t), byId);
}
