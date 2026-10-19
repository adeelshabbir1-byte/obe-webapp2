import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import TranscriptView from "../../../components/TranscriptView";

export const dynamic = "force-dynamic";

export default async function StudentTranscriptPage({ searchParams }: { searchParams: { tab?: string } }) {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");
  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>My Transcript</h1>
        <TranscriptView studentId={student.id} tab={searchParams.tab || "now"} base="/student/transcript" />
      </div>
    </StudentShell>
  );
}
