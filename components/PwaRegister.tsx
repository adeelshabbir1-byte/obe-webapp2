"use client";

import { useEffect } from "react";

/** Registers the service worker so OBEHUB can be installed on a phone's home screen. */
export default function PwaRegister() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return null;
}
