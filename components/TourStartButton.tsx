"use client";
import { useRouter } from "next/navigation";
import { TOUR_KEY, TOUR_STEPS_KEY, type TourStep } from "../lib/tourSteps";

export default function TourStartButton({ steps }: { steps: TourStep[] }) {
  const router = useRouter();
  const start = () => { try { sessionStorage.setItem(TOUR_STEPS_KEY, JSON.stringify(steps)); sessionStorage.setItem(TOUR_KEY, "0"); } catch { /* ignore */ } router.push(steps[0].href); };
  return <button className="btn" onClick={start} disabled={!steps.length}>Start the tour</button>;
}
