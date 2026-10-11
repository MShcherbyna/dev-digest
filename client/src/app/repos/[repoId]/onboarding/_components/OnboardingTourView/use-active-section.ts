"use client";

import React from "react";
import { ACTIVE_ROOT_MARGIN, SECTION_KEYS, type SectionKey } from "./constants";
import { sectionDomId } from "./helpers";

/** Scroll-spy: the topmost section crossing the upper band of the viewport is active. */
export function useActiveSection(enabled: boolean) {
  const [active, setActive] = React.useState<SectionKey>(SECTION_KEYS[0]);

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<SectionKey>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = SECTION_KEYS.find((k) => sectionDomId(k) === e.target.id);
          if (!key) continue;
          if (e.isIntersecting) visible.add(key);
          else visible.delete(key);
        }
        const top = SECTION_KEYS.find((k) => visible.has(k));
        if (top) setActive(top);
      },
      { rootMargin: ACTIVE_ROOT_MARGIN },
    );
    for (const k of SECTION_KEYS) {
      const el = document.getElementById(sectionDomId(k));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [enabled]);

  return { active, setActive };
}
