/** Ordered accent palette for data visuals (stat cards, bars, progress), tuned
 * to sit with the "Emerald Prestige" theme (deep emerald, secondary green, gold).
 * Consecutive items are far apart in hue and a screen hands them out in order,
 * so no two elements on one screen share a colour. `c` is the accent (icons,
 * bars), `t` the matching tint (card and chip backgrounds). */
export const ACCENTS = [
  { c: "#038666", t: "#E7F5EF" }, // secondary green (brand)
  { c: "#D98E0B", t: "#FFF4DC" }, // gold (brand highlight, deepened for icons)
  { c: "#2E7FB8", t: "#E7F1FA" }, // steel blue
  { c: "#7A5AC8", t: "#F1ECFB" }, // amethyst
  { c: "#C8553D", t: "#FBEAE5" }, // terracotta
  { c: "#1B4322", t: "#E4EDE6" }, // emerald (brand)
  { c: "#0E8FA0", t: "#E1F5F7" }, // lagoon
  { c: "#B04A7E", t: "#F9E9F1" }, // plum rose
  { c: "#6E8B2F", t: "#EEF3E1" }, // olive
  { c: "#8C6D3F", t: "#F5EFE5" }, // bronze
  { c: "#4B6584", t: "#EAEFF5" }, // slate
  { c: "#D0473F", t: "#FBE8E6" }, // brick
] as const;

export function accentAt(i: number) {
  return ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

/** The accent darkened toward the text colour, for numbers/labels that must stay readable on white. */
export function accentText(color: string) {
  return `color-mix(in srgb, ${color} 70%, #0B241A)`;
}
