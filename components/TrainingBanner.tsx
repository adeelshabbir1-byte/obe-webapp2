import Link from "next/link";
import { trainingBlock } from "../lib/training";

/** Shown on Subject Expert / Instructor course lists when the training rule blocks course-design changes. */
export default async function TrainingBanner({ user }: { user: { id: string; role: string; managedById: string | null } }) {
  const msg = await trainingBlock(user).catch(() => null);
  if (!msg) return null;
  return <div className="card" style={{ borderLeft: "4px solid #B3261E" }}>{msg} <Link href="/learn/certification"><b>Start now →</b></Link></div>;
}
