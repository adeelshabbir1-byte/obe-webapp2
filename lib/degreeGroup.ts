// Groups curricula of the same degree together (all BS Computer Science ones - HEC, Punjab University,
// prospectus copies, ... - sit side by side), ignoring bracketed suffixes like "(PU)" or "(BSCS)".
export function degreeGroupLabel(c: { degreeProgram?: string | null; title: string }): string {
  return (c.degreeProgram || c.title).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}
export function degreeSortKey(c: { degreeProgram?: string | null; title: string }): string {
  return degreeGroupLabel(c).toLowerCase();
}
