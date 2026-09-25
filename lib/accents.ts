/** Ordered accent palette for data visuals (stat cards, bars, progress).
 * Consecutive items are deliberately far apart in hue, and a screen hands them
 * out in order, so no two elements on one screen share a colour. `c` is the
 * strong colour (icons, bars), `t` the matching tint (icon chips). */
export const ACCENTS = [
  { c: "#1A40EA", t: "#EEF2FF" }, // royal blue (brand)
  { c: "#E0529C", t: "#FDEAF4" }, // raspberry
  { c: "#059669", t: "#E3F8EF" }, // emerald
  { c: "#5E16F0", t: "#F1EAFF" }, // electric violet (brand)
  { c: "#EA580C", t: "#FFEDE3" }, // tangerine
  { c: "#0089E6", t: "#E5F5FF" }, // azure (brand)
  { c: "#C026D3", t: "#FBE9FD" }, // magenta
  { c: "#0D9488", t: "#E0F6F3" }, // teal
  { c: "#DD8A00", t: "#FFF3DC" }, // amber
  { c: "#E11D48", t: "#FFE8ED" }, // crimson
  { c: "#4338CA", t: "#EAE8FD" }, // indigo
  { c: "#65A30D", t: "#EEF7E0" }, // lime
] as const;

export function accentAt(i: number) {
  return ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}
