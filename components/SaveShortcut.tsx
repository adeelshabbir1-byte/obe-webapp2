"use client";

import { useEffect } from "react";

// A single, app-wide Ctrl+S / Cmd+S handler, mounted once in the root
// layout so it works on every page without each screen having to wire
// its own listener. Most of this system's "Save" buttons are already a
// plain <form onSubmit>, and most of its per-field editors already save
// the instant you click away (onBlur) — so rather than hand-wiring a
// shortcut into every one of those individually, Ctrl+S just re-uses
// whichever of those two mechanisms the current screen already has:
//   1. Always blocks the browser's own "Save Page As" dialog first.
//   2. If a field is focused, blur it — firing that field's own onBlur
//      save immediately instead of waiting for the user to tab away.
//   3. Then, in order: submit the nearest <form> the focused element
//      belongs to (covers every "Save"/"Save Draft"/"Save Weights"-style
//      button in the app, since those are real form submits); if there's
//      no form in play, click EVERY visible, enabled button marked
//      data-save-shortcut="true" instead — for the handful of screens
//      (like the Assessments tab, which has both a "Save Instrument
//      Changes" button and a separate "Save Mapping Changes" button)
//      whose save isn't a form submit at all. Clicking all of them
//      (not just the first) means Ctrl+S saves everything dirty on
//      the page in one press, not just whichever batch happens first.
export default function SaveShortcut() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isSaveCombo = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s";
      if (!isSaveCombo) return;
      e.preventDefault();

      const active = document.activeElement as HTMLElement | null;
      const ownerForm = active?.closest("form") as HTMLFormElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
        active.blur();
      }

      // Small delay so a just-fired onBlur save (or the blur above) has
      // a moment to update local "dirty"/form state before we act —
      // e.g. typing in a field then immediately pressing Ctrl+S.
      window.setTimeout(() => {
        if (ownerForm) { ownerForm.requestSubmit(); return; }
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-save-shortcut="true"]'));
        for (const b of buttons) { if (!b.disabled && b.offsetParent !== null) b.click(); }
      }, 50);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}
