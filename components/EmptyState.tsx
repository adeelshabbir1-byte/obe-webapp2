import Link from "next/link";

// An empty list that says what to do first, with the buttons in place (Adeel prompt §19.1).
export default function EmptyState({ title, hint, actions = [] }: { title: string; hint?: string; actions?: { label: string; href: string }[] }) {
  return (
    <div style={{ border: "1px dashed var(--line, #ccc)", borderRadius: 10, padding: "18px 16px", textAlign: "center", margin: "10px 0" }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {hint && <div className="small-note" style={{ marginTop: 4 }}>{hint}</div>}
      {actions.length > 0 && <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>{actions.map((a, i) => <Link key={a.href} href={a.href} className={i === 0 ? "btn btn-sm" : "btn-link"}>{a.label}</Link>)}</div>}
    </div>
  );
}
