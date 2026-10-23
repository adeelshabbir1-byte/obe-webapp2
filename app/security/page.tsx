import Link from "next/link";

export const metadata = { title: "Security & data protection" };

const S: [string, string[]][] = [
  ["Your data belongs to your institute", ["Each institute's data is kept separate and is visible only to its own people, by role.", "The Institute Head can download a complete export of the institute's academic data at any time (Institute Settings → Data export)."]],
  ["Sign-in", ["Passwords are stored only as salted scrypt hashes, never as text.", "Optional two-step verification (authenticator app) for every staff account.", "Sign in with Google Workspace or Microsoft 365 when the institute enables it; only existing accounts with a matching institutional email can use it.", "Accounts lock for 15 minutes after 8 wrong passwords, and a network address is blocked after 30 failed sign-ins in 15 minutes; sessions expire after 7 days and can be revoked."]],
  ["Who can see what", ["Every page and API checks the person's role and institute: an instructor sees only their own courses, a Program Lead only their programs, a student only their own record.", "Results are locked once approved; later changes need a recorded grade-change request.", "Every mark entry and change, approval, sign-in and export is written to an audit log the Institute Head can review."]],
  ["Hosting and transport", ["All traffic uses HTTPS (TLS).", "The application runs on Vercel and the database on Supabase (PostgreSQL), in the Tokyo region close to Pakistan.", "Uploaded evidence files are stored in Supabase Storage."]],
  ["Backups and recovery", ["The database is backed up daily by the hosting provider.", "Each institute is also backed up on its own every week (the last 8 kept), and the Institute Head can download a backup or restore deleted records at any time (Backups).", "Students can download all the data kept about them (Alerts & Contact → My data).", "Approved results are also kept as frozen transcript records, so a later change to a course plan never rewrites history."]],
  ["Reporting a problem", ["Use “Report a problem” inside the app, or contact Lets Innovate Pvt Ltd. Security issues are handled first."]],
];

export default function SecurityPage() {
  return (
    <main style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px", lineHeight: 1.55 }}>
      <Link href="/login" className="small-note">← Sign in</Link>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Security &amp; data protection</h1>
      <p className="small-note">How OBEHUB keeps university data safe. For procurement and IT reviews.</p>
      {S.map(([h, items]) => <section key={h} className="card"><h2 style={{ fontSize: 17, marginTop: 0 }}>{h}</h2><ul style={{ margin: 0, paddingLeft: 20 }}>{items.map((t) => <li key={t}>{t}</li>)}</ul></section>)}
    </main>
  );
}
