"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import MarksGrid from "./MarksGrid";

/** Marks grid inside Result Mate: after the instructor stops typing, totals, grades and charts below are recomputed. */
export default function ResultMateMarks(props: Omit<React.ComponentProps<typeof MarksGrid>, "onSaved">) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <MarksGrid
      {...props}
      onSaved={() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 1500);
      }}
    />
  );
}
