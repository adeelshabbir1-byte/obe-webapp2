import Link from "next/link";
// The one curriculum comparison page (queue item 11): three tabs over the same batch.
export default function CompareTabs({ active, batchId }: { active: "hec" | "master" | "detail"; batchId?: string }) {
  const q = batchId ? `?batch=${batchId}&batchId=${batchId}` : "";
  const tabs: [typeof active, string, string][] = [["hec", "Against HEC", `/coordinator/hec-comparison${q}`], ["master", "Against the national master", `/coordinator/curriculum-sync${q}`], ["detail", "CLOs & topics", `/curriculum-compare${q}`]];
  return <nav className="tabs no-print" style={{ display: "flex", gap: 6, margin: "4px 0 12px", flexWrap: "wrap" }} aria-label="Curriculum comparison">{tabs.map(([k, l, h]) => <Link key={k} href={h} className={k === active ? "btn btn-sm" : "btn btn-secondary btn-sm"} aria-current={k === active ? "page" : undefined}>{l}</Link>)}</nav>;
}
