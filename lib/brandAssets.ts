/** The product logo files, in one place so a new logo is a one-line swap.
 * File names carry a version: /brand/* is cached by browsers for a week, so a
 * changed logo must get a new file name to show up straight away. */
export const BRAND = {
  /** Full logo: mark + wordmark + tagline (sign-in cards). */
  logo: { src: "/brand/obehub-logo-maroon.webp", width: 440, height: 352 },
  /** The mark alone (sidebar, dashboard, sign-in panel). */
  mark: { src: "/brand/obehub-mark-maroon.webp", width: 324, height: 256 },
  /** "OBEHUB" lettering alone (sidebar, student header). */
  wordmark: { src: "/brand/obehub-wordmark-only-maroon.webp", width: 480, height: 81 },
} as const;

/** Width/height attributes for showing an asset at a given rendered height, keeping its aspect ratio. */
export function sized(asset: { width: number; height: number }, height: number) {
  return { width: Math.round((asset.width / asset.height) * height), height };
}
