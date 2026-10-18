/* FilterSelect — a filter chip (design: CI Runs) backed by a native <select>, so it is a
   real, labelled, keyboard-operable control. It looks like the design's Chip. */
"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";

export function FilterSelect({
  label,
  icon,
  value,
  onChange,
  options,
  active,
}: {
  /** Accessible name, e.g. "Status". */
  label: string;
  icon?: IconName;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Highlighted when the filter narrows the list. */
  active: boolean;
}) {
  const Ico = icon ? Icon[icon] : null;
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px 5px 12px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
        background: active ? "var(--accent-bg)" : "transparent",
        color: active ? "var(--accent-text)" : "var(--text-secondary)",
      }}
    >
      {Ico && <Ico size={13} />}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
          paddingRight: 4,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ color: "var(--text-primary)", background: "var(--bg-elevated)" }}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon.ChevronDown size={12} style={{ opacity: 0.7 }} />
    </label>
  );
}
