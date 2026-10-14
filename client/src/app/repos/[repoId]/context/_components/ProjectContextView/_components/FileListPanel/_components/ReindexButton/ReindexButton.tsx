/* ReindexButton — the single icon button in the Project Context panel header.
   Mirrors the vendored IconBtn look (30px box), plus disabled/spinning states. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "../../../../styles";

export interface ReindexButtonProps {
  running: boolean;
  noClone: boolean;
  onClick: () => void;
}

export function ReindexButton({ running, noClone, onClick }: ReindexButtonProps) {
  const t = useTranslations("context");
  const [hover, setHover] = React.useState(false);
  const hintId = React.useId();
  const disabled = running || noClone;
  const label = running ? t("page.reindexing") : t("page.reindex");
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={noClone ? t("page.cloneFirst") : label}
        aria-describedby={noClone ? hintId : undefined}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={s.reindexBtn(hover && !disabled, disabled)}
      >
        <Icon.RefreshCw size={16} style={running ? s.spin : undefined} />
      </button>
      {noClone && (
        <span id={hintId} style={s.srOnly}>
          {t("page.cloneFirst")}
        </span>
      )}
    </>
  );
}
