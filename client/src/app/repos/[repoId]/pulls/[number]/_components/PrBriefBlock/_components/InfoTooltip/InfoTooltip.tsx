"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

/**
 * A focusable ⓘ whose tooltip opens on hover AND keyboard focus, and closes on
 * blur, mouse leave or Escape (AC-42). No Tooltip primitive exists in
 * @devdigest/ui, so it is built here; `aria-describedby` links the two.
 */
export function InfoTooltip({ text }: { text: string }) {
  const id = React.useId();
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const open = hover || focus;
  return (
    <span
      style={s.wrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={text}
        aria-describedby={open ? id : undefined}
        style={s.button}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setHover(false);
            setFocus(false);
          }
        }}
      >
        <Icon.Info size={14} aria-hidden />
      </button>
      {open && (
        <span role="tooltip" id={id} style={s.tip}>
          {text}
        </span>
      )}
    </span>
  );
}
