"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** A QR code drawn as one SVG path — sharp at any size, readable from the back of a room on a projector. */
export default function QrCode({ value, size = 320, label }: { value: string; size?: number | string; label?: string }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < count; r++) {
      let c = 0;
      while (c < count) {
        if (!qr.isDark(r, c)) { c++; continue; }
        const start = c;
        while (c < count && qr.isDark(r, c)) c++;
        path += `M${start + 4} ${r + 4}h${c - start}v1h-${c - start}z`;
      }
    }
    return { d: path, n: count + 8 };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label || "QR code"} shapeRendering="crispEdges" style={{ background: "#fff", display: "block", maxWidth: "100%", height: "auto" }}>
      <path d={d} fill="#1b1215" />
    </svg>
  );
}
