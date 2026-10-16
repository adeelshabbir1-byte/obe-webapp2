import Link from "next/link";
import AttendScanner from "../../components/attendance/AttendScanner";
import { BRAND } from "../../lib/brandAssets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check in", referrer: "no-referrer" };

// Where a scanned attendance code lands (from the phone's camera app), and the in-browser scanner.
export default function AttendPage({ searchParams }: { searchParams: { t?: string } }) {
  const token = typeof searchParams.t === "string" ? searchParams.t.slice(0, 200) : null;
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "20px 16px 40px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={BRAND.mark.src} alt="" width={34} height={34} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Class attendance</div>
            <div className="small-note">Scan the code on the classroom screen</div>
          </div>
        </div>
        <AttendScanner initialToken={token} />
        <p className="small-note" style={{ textAlign: "center", margin: 0 }}>
          Phone dead or the scan won&apos;t work? Tell your instructor — they can mark you by hand. <Link href="/student/attendance">My attendance</Link>
        </p>
      </div>
    </main>
  );
}
