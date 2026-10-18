/* WizardStepper — the vendored ExportWizardSteps (visual only, aria-hidden) plus a visually
   hidden ordered list that carries `aria-current="step"` (AC-2, NFR-7). The vendored stepper
   has no ARIA of its own and must not be edited. */
"use client";

import React from "react";
import { ExportWizardSteps } from "@devdigest/ui";
import { s } from "./styles";

export function WizardStepper({ step, labels, ariaLabel }: { step: number; labels: string[]; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel}>
      <div aria-hidden="true">
        <ExportWizardSteps step={step} labels={labels} />
      </div>
      <ol style={s.visuallyHidden}>
        {labels.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
