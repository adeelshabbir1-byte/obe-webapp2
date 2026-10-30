import { readFileSync } from "fs";
import { join } from "path";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import Shell from "../../../../components/Shell";
import { adminCan, adminNavFor } from "../../../../lib/platformTeam";

export const dynamic = "force-dynamic";

// "How to restore" — docs/restore.md, shown in the app for the IT Manager (linked from System Health).
export default async function RestoreGuidePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!(await adminCan(user, "SECURITY")) && user.role !== "CHAIRMAN") redirect("/dashboard");
  let md = "";
  try { md = readFileSync(join(process.cwd(), "docs", "restore.md"), "utf8"); } catch { md = "# How to restore\n\nThe guide is in the repository at docs/restore.md."; }
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p);
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list.ordered ? "ol" : "ul"; blocks.push(<L key={blocks.length} style={{ fontSize: 14, lineHeight: 1.6 }}>{list.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</L>); list = null; } };
  for (const line of md.split(/\r?\n/)) {
    const m = /^(\d+)\.\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (/^#\s/.test(line)) { flush(); blocks.push(<h1 key={blocks.length} style={{ fontSize: 22 }}>{line.slice(2)}</h1>); }
    else if (/^##\s/.test(line)) { flush(); blocks.push(<h2 key={blocks.length} style={{ fontSize: 17, marginTop: 20 }}>{line.slice(3)}</h2>); }
    else if (m) { const ordered = /^\d/.test(line); if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; } list.items.push(m[m.length - 1]); }
    else if (line.trim()) { flush(); blocks.push(<p key={blocks.length} style={{ fontSize: 14, lineHeight: 1.6 }}>{inline(line)}</p>); }
    else flush();
  }
  flush();
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={await adminNavFor(user)}>
      <div className="card" style={{ maxWidth: 900 }}>{blocks}</div>
    </Shell>
  );
}
