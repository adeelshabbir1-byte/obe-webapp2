"use client";
import ErrorReport from "../components/ErrorReport";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ background: "#F7F4F3" }}><ErrorReport {...props} /></body></html>;
}
