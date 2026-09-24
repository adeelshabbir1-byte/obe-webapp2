import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import DegreePlanner from "../../../components/DegreePlanner";

export default async function DegreePlanPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h1 style={{ fontSize: 22 }}>Degree Plan</h1>
          <a href="/student/registration" style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>← Course Registration</a>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 20 }}>
          Plan out your future semesters, try different course orderings, and play with hypothetical grades to
          see how they'd affect your CGPA — nothing here is real until you actually register and pass a
          course.
        </p>
        <DegreePlanner />
      </div>
    </div>
  );
}
