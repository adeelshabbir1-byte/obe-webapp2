"use client";
import { useState } from "react";

// A form that is not needed the moment the page opens: shown as one button, and the form opens under it on click
// (with a Close button). Keeps pages short and quick to read.
export default function Reveal({ label, children, open: start = false, className = "btn btn-secondary btn-sm" }: { label: string; children: React.ReactNode; open?: boolean; className?: string }) {
  const [open, setOpen] = useState(start);
  if (!open) return <button type="button" className={className} onClick={() => setOpen(true)} data-reveal={label}>{label}</button>;
  return (
    <div style={{ margin: "8px 0" }} data-revealed={label}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} aria-label={`Close: ${label}`}>Close</button></div>
      {children}
    </div>
  );
}
