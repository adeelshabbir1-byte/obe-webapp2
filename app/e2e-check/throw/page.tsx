import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Test-only (E2E_TEST_ROUTES=1): a page that crashes, to check the friendly error page and its reference code.
export default function ThrowPage() {
  if (process.env.E2E_TEST_ROUTES !== "1") notFound();
  throw new Error("E2E check: this page fails on purpose (CNIC 35202-1234567-3 must never be shown or logged).");
}
