/* RadioOption — a card-shaped radio. A native (visually hidden) radio input inside a label,
   so a group sharing `name` gets arrow-key operation, selection and `disabled` for free
   (NFR-7). A disabled option is skipped by keyboard and cannot be picked by mouse. */
"use client";

import React from "react";

const hiddenInput: React.CSSProperties = {
  position: "absolute",
  opacity: 0,
  width: 1,
  height: 1,
  margin: 0,
  pointerEvents: "none",
};

export function RadioOption({
  name,
  value,
  checked,
  disabled,
  onSelect,
  style,
  checkedStyle,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
  style?: React.CSSProperties;
  checkedStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [ringed, setRinged] = React.useState(false);
  return (
    <label
      aria-disabled={disabled || undefined}
      style={{
        position: "relative",
        display: "block",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        outline: ringed ? "2px solid var(--accent)" : "none",
        outlineOffset: 2,
        ...style,
        ...(checked ? checkedStyle : null),
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onChange={() => {
          if (!disabled) onSelect(value);
        }}
        onFocus={(e) => {
          // Ring only for keyboard focus; engines without :focus-visible just skip the ring.
          try {
            setRinged(e.currentTarget.matches(":focus-visible"));
          } catch {
            setRinged(false);
          }
        }}
        onBlur={() => setRinged(false)}
        style={hiddenInput}
      />
      {children}
    </label>
  );
}
