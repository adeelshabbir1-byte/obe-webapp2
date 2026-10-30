import Link from "next/link";

// A page that doesn't exist (or a link to something that was removed).
export default function NotFound() {
  return (
    <div role="alert" style={{ maxWidth: 560, margin: "60px auto", padding: 24, background: "#fff", border: "1px solid #E6DADC", borderRadius: 12 }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>This page could not be found</h2>
      <p style={{ fontSize: 14, color: "#5E5457" }}>The link may be old, or the item was removed. Check the address, or go back to your home page.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="btn" href="/dashboard">Go to my home</Link>
        <Link className="btn btn-secondary" href="/student/dashboard">Student home</Link>
      </div>
    </div>
  );
}
