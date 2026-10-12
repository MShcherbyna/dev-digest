"use client";

import React from "react";
import { COLLAPSE_STORAGE_KEY, type SectionKey } from "./constants";

type CollapseMap = Partial<Record<SectionKey, true>>;

function read(): CollapseMap {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as CollapseMap) : {};
  } catch {
    return {};
  }
}

function write(map: CollapseMap): void {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: the state just isn't remembered */
  }
}

/** Per-section collapse state kept in browser storage only (all expanded by default). */
export function useSectionCollapse() {
  const [map, setMap] = React.useState<CollapseMap>(read);

  const set = React.useCallback((key: SectionKey, collapsed: boolean) => {
    setMap((prev) => {
      const next = { ...prev };
      if (collapsed) next[key] = true;
      else delete next[key];
      write(next);
      return next;
    });
  }, []);

  const isCollapsed = (key: SectionKey): boolean => map[key] === true;
  const toggle = (key: SectionKey) => set(key, !isCollapsed(key));
  const expand = (key: SectionKey) => set(key, false);
  return { isCollapsed, toggle, expand };
}
