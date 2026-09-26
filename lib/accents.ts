/** Ordered accent palette for data visuals (stat cards, bars, progress).
 * Light, airy mid-tones that sit with the sky-blue OBEHUB brand. Consecutive
 * items are far apart in hue and a screen hands them out in order, so no two
 * elements on one screen share a colour. `c` is the accent (icons, bars),
 * `t` the matching tint (card and chip backgrounds). */
export const ACCENTS = [
  { c: "#1F89F5", t: "#EAF4FF" }, // brand blue
  { c: "#14A394", t: "#E4F7F5" }, // teal
  { c: "#6C7AF0", t: "#EEF0FF" }, // periwinkle
  { c: "#F0A020", t: "#FFF5E1" }, // amber
  { c: "#22B573", t: "#E6F8EF" }, // mint
  { c: "#F2745C", t: "#FFEFEA" }, // coral
  { c: "#17B3D9", t: "#E3F8FD" }, // sky cyan
  { c: "#B35FD6", t: "#F7EEFC" }, // orchid
  { c: "#E8577A", t: "#FDEDF1" }, // rose
  { c: "#7FB82D", t: "#F1F8E4" }, // lime
  { c: "#4F7CC4", t: "#ECF2FB" }, // steel blue
  { c: "#C9A227", t: "#FAF5E0" }, // gold
] as const;

export function accentAt(i: number) {
  return ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

/** The accent darkened toward the text colour, for numbers/labels that must stay readable on white. */
export function accentText(color: string) {
  return `color-mix(in srgb, ${color} 68%, #0F2E57)`;
}
