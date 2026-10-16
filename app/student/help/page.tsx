import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import HelpCenter from "../../../components/help/HelpCenter";
import HelpRequests from "../../../components/help/HelpRequests";
import { articlesFor, helpViewer } from "../../../lib/help/access";
import { visibleCards } from "../../../lib/help/cards";
import { CATEGORIES, STUDENT } from "../../../lib/help/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help" };

// Help for students: answers about the portal, and requests to the people who can sort things out.
export default async function StudentHelpPage({ searchParams }: { searchParams: { a?: string; id?: string } }) {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");
  const viewer = await helpViewer("student");
  const articles = visibleCards(await articlesFor(viewer?.chairmanId || null), STUDENT);
  return (
    <StudentShell studentName={student.name}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Help</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, margin: "0 0 12px", maxWidth: 820 }}>
        Answers about registration, exams, results, your FYP and your account. If none of them helps, ask below — your request goes to your Program Lead, advisor or the right office.
      </p>
      <HelpCenter audience="student" articles={articles} categories={CATEGORIES} initialKey={searchParams.a} />
      <h2 id="requests" style={{ fontSize: 17, margin: "22px 0 10px", scrollMarginTop: 80 }}>My help requests</h2>
      <HelpRequests audience="student" initialId={searchParams.id} />
    </StudentShell>
  );
}
