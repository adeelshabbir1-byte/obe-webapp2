"use client";
export default function PrintButton({ label = "Print / Save as PDF", className = "btn btn-brass" }: { label?: string; className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>;
}
