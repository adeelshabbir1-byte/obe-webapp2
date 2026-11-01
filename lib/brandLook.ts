// Institute look (Adeel prompt §18): main colour (checked for WCAG AA contrast against white text) and the logo watermark
// (off / centre / bottom-right). Stored as institute-level ScopedSettings "brand.color" and "brand.watermark".
export const COLOR_KEY = "brand.color", WATERMARK_KEY = "brand.watermark";

function lum(hex: string) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contrast ratio of a colour with white (buttons and the top bar carry white text). */
export const contrastWithWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);
export const validHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
/** A darker shade for hover / borders. */
export function darken(hex: string, f = 0.75) {
  const n = hex.replace("#", "");
  return "#" + [0, 2, 4].map((i) => Math.round(parseInt(n.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
}
/** The suggestion for a colour that fails: darken it until it passes. */
export function suggestPassing(hex: string) {
  let h = hex; for (let i = 0; i < 12 && contrastWithWhite(h) < 4.5; i++) h = darken(h, 0.88);
  return h;
}
