"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin progress bar at the top of the viewport while a server-rendered page
 * is loading. Every page here is dynamic (auth + database), so without this a
 * click can look like it did nothing for a moment.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (timer.current) clearInterval(timer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    timer.current = null;
    hideTimer.current = null;
  }

  function start() {
    clearTimers();
    setVisible(true);
    setWidth(12);
    timer.current = setInterval(() => {
      setWidth((w) => (w < 85 ? w + Math.max(0.6, (85 - w) * 0.08) : w));
    }, 180);
  }

  // Navigation finished: route (or query) changed.
  useEffect(() => {
    if (!visible) return;
    clearTimers();
    setWidth(100);
    hideTimer.current = setTimeout(() => { setVisible(false); setWidth(0); }, 280);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      // File downloads served by API routes don't navigate.
      if (url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); clearTimers(); };
  }, []);

  if (!visible) return null;
  return <div className="nav-progress" style={{ width: `${width}%` }} aria-hidden="true" />;
}
