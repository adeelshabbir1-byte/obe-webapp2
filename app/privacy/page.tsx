import Link from "next/link";

export const metadata = { title: "Privacy" };

// What OBEHUB keeps about people, why, who sees it, and how to ask for a correction. Public (no sign-in).
export default function PrivacyPage() {
  const h: React.CSSProperties = { fontSize: 17, marginTop: 22, marginBottom: 6 };
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 18px 60px", lineHeight: 1.6, fontSize: 14.5 }}>
      <h1 style={{ fontSize: 26 }}>Privacy</h1>
      <p>OBEHUB is used by universities to plan courses, record teaching and assessment, and report to accreditation bodies. Each university decides who uses it and is responsible for the data it enters; Lets Innovate Pvt Ltd runs the service for them.</p>

      <h2 style={h}>What we keep</h2>
      <ul>
        <li><b>Students:</b> name, roll number, batch and program; registrations, attendance, marks, results and transcripts; details the accreditation and HEMIS returns ask for (father&apos;s name, CNIC, date of birth, domicile, previous qualifications) when the student or the university enters them.</li>
        <li><b>Staff:</b> name, login, role, department; teaching records, course plans and assessments; profile details for accreditation (qualifications, experience, CNIC).</li>
        <li><b>Use of the service:</b> sign-ins, changes and exports are written to an audit log; errors are recorded with a reference code to fix them.</li>
      </ul>

      <h2 style={h}>Why</h2>
      <p>To run the university&apos;s academic work (courses, registration, assessment and results), to measure learning outcomes, and to prepare the reports regulators require (HEC, NCEAC and other councils). Nothing is sold or used for advertising.</p>

      <h2 style={h}>Who sees it</h2>
      <ul>
        <li>People at your university, according to their role: a teacher sees their own courses and students; Program Leads, heads of department and the examination office see their programs; students see only their own records.</li>
        <li>CNICs are shown masked (e.g. 35202-•••••••-3) everywhere except to the platform&apos;s Super Admin, and are masked in every download — except a regulator&apos;s upload file that needs it, which only the Institute Head, Dean, HOD, Program Lead or Department Coordinator can download, and which is logged.</li>
        <li>CNICs, names and marks are never put in web addresses, error reports or monitoring.</li>
        <li>Every export of student data is logged (who, what, how many rows). Bulk exports of student data need the Program Lead role or above.</li>
      </ul>

      <h2 style={h}>How long</h2>
      <p>By default everything is kept, as universities must keep academic records. A university can set how long inactive accounts and graduated students&apos; detailed records (marks, attendance) are kept; transcripts are always kept. Nothing is deleted automatically: the Super Admin sees what would be removed and confirms it first.</p>

      <h2 style={h}>Your rights</h2>
      <p>You can ask to see what is kept about you and to have it corrected. Students can download their own data from the student portal (My Data). For a correction, contact your Program Lead or the university&apos;s examination office; staff can also correct their own profile under My Profile. If you are not satisfied, contact the university&apos;s administration.</p>

      <h2 style={h}>Security</h2>
      <p>See <Link href="/security">Security &amp; data protection</Link> for how accounts and data are protected.</p>
    </main>
  );
}
