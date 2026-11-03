import { redirect } from "next/navigation";

// The Moodle link moved to Teaching tools (Moodle, Google Classroom + Meet, Microsoft Teams, YouTube).
export default function LmsPage() { redirect("/teaching-tools"); }
