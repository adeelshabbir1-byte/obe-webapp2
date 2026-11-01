import { allStored } from "./scopedSettings";
import { COLOR_KEY, WATERMARK_KEY, validHex } from "./brandLook";

// The institute's stored look (lib/brandLook.ts has the pure checks).
export async function lookOf(chairmanId: string) {
  if (!chairmanId) return { color: null as string | null, watermark: "center" };
  const rows = (await allStored(chairmanId).catch(() => [])).filter((r) => r.scopeType === "INSTITUTE");
  const color = rows.find((r) => r.key === COLOR_KEY)?.value || null;
  const watermark = rows.find((r) => r.key === WATERMARK_KEY)?.value || "center";
  return { color: color && validHex(color) ? color : null, watermark };
}
