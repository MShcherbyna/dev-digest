import React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside `ref` while mounted: focus moves into the dialog
 * on open, Tab / Shift+Tab wrap at the ends, and focus returns to the opener on
 * close. The vendored Modal has none of this, so it lives in our wrapper.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]') ?? root;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

    if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
    (items()[0] ?? dialog).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root.contains(active) || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [ref]);
}
