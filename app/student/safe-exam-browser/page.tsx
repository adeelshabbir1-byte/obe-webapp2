import Link from "next/link";

export const metadata = { title: "Safe Exam Browser — how to" };

// A one-page guide for students and computer labs: installing Safe Exam Browser and opening a quiz's .seb file.
export default function SafeExamBrowserGuide() {
  return (
    <main style={{ maxWidth: 760, margin: "24px auto", padding: "0 16px", lineHeight: 1.6 }}>
      <p><Link href="/student/quizzes">← Quizzes</Link></p>
      <h1 style={{ fontSize: 24 }}>Taking a quiz in Safe Exam Browser</h1>
      <p>Some quizzes (usually high-stakes tests) only open in <b>Safe Exam Browser</b> (SEB), a free browser that locks the computer to the quiz. It works on Windows and macOS laptops and desktops — not on phones.</p>
      <h2 style={{ fontSize: 18 }}>Students</h2>
      <ol>
        <li>Download and install Safe Exam Browser from <b>safeexambrowser.org</b> (Downloads → Windows or macOS). Use the latest version.</li>
        <li>On the quiz page, click <b>this quiz&apos;s .seb file</b>. Open the downloaded file: SEB starts and opens the quiz.</li>
        <li>Sign in if asked, then start the quiz. You cannot switch to other programs until you submit; SEB closes when you finish.</li>
        <li>If your connection drops, open the .seb file again within the quiz time: your saved answers are kept and the lost time is added back.</li>
      </ol>
      <h2 style={{ fontSize: 18 }}>Computer labs</h2>
      <ol>
        <li>Install Safe Exam Browser on every lab computer before the test (administrator rights are needed once).</li>
        <li>Download the quiz&apos;s .seb file from the teacher&apos;s quiz page and put it on the desktop, or let students download it from their quiz page.</li>
        <li>Test one computer before the students arrive: open the .seb file and check the quiz page appears (it says the quiz opens at its time).</li>
        <li>Do not change the .seb file: the quiz checks it, and a changed file is refused (&quot;Open this quiz in Safe Exam Browser&quot;).</li>
      </ol>
      <p className="small-note">No webcam is used. Opening the quiz in a normal browser is refused for SEB quizzes.</p>
    </main>
  );
}
