import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { institutePeople } from "../../../lib/institutePeople";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";

export default async function ChairmanPeoplePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const people = await institutePeople(user.id);
  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>All Users and Roles</h1>
        <a href="/api/chairman/people/export" className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Everyone who works in your institute, with their login name. Passwords are never shown: a new account has the temporary password it was created with, and “Temporary password” below means the person has not signed in and changed it yet.
        A teacher with an extra role signs in with the same login name and chooses the role at sign-in.
      </p>
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>{people.length} people</p>
        <SortableTable>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Also works as</th><th>Department</th><th>Program</th><th>Login</th><th>Email</th></tr></thead>
          <tbody>
            {people.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No one has been added yet.</td></tr>}
            {people.map((p) => (
              <tr key={p.id}>
                <td><b>{p.username}</b></td><td>{p.name}</td><td>{p.role}</td>
                <td style={{ fontSize: 12 }}>{p.also || <span style={{ color: "var(--slate)" }}>—</span>}</td>
                <td>{p.department}</td><td>{p.program}</td>
                <td style={{ fontSize: 12 }}>{p.status}</td><td style={{ fontSize: 12 }}>{p.email}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
