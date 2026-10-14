/* AccessibleModal — the vendored Modal plus what it lacks: focus trap + focus
   return to the opener, Escape to close, and aria-labelledby on the dialog. */
"use client";

import React from "react";
import { Modal } from "@devdigest/ui";
import { useFocusTrap } from "./focus-trap";

export function AccessibleModal({
  width,
  title,
  subtitle,
  footer,
  onClose,
  returnFocusTo,
  children,
}: {
  width?: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  /** Element to refocus on close; defaults to whatever was focused when the modal mounted. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap(rootRef, returnFocusTo);

  React.useEffect(() => {
    rootRef.current?.querySelector('[role="dialog"]')?.setAttribute("aria-labelledby", titleId);
  }, [titleId]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div ref={rootRef}>
      <Modal
        width={width}
        title={<span id={titleId}>{title}</span>}
        subtitle={subtitle}
        footer={footer}
        onClose={onClose}
      >
        {children}
      </Modal>
    </div>
  );
}
