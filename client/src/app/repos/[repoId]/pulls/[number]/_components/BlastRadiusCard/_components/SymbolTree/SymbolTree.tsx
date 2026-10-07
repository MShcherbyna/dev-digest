"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadiusResponse } from "@/lib/hooks/blast";
import { DEFAULT_EXPANDED_GROUPS } from "../../constants";
import { symbolLabel } from "../../helpers";
import { s } from "../../styles";

interface SymbolTreeProps {
  data: BlastRadiusResponse;
  repoFullName: string | null;
  /** Fallback commit for caller links when the index commit is unknown. */
  headSha: string;
}

/** Collapsible symbol rows -> `file:line` callers -> endpoint chips -> cron chips (3.png). */
export function SymbolTree({ data, repoFullName, headSha }: SymbolTreeProps) {
  const t = useTranslations("blast");
  // Only user toggles are state; the default (first group open) is derived.
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});
  // Caller lines come from the indexed commit, so link there (line numbers match).
  const ref = data.ref_sha ?? headSha;

  return (
    <div style={s.tree}>
      {data.downstream.map((group, i) => {
        const open = toggled[group.symbol] ?? i < DEFAULT_EXPANDED_GROUPS;
        const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
        return (
          <div key={group.symbol}>
            <button
              type="button"
              aria-expanded={open}
              style={s.symbolRow(open)}
              onClick={() => setToggled((prev) => ({ ...prev, [group.symbol]: !open }))}
            >
              <Chevron size={14} aria-hidden style={{ color: "var(--text-muted)" }} />
              <Icon.Code size={14} aria-hidden style={s.symbolIcon} />
              <span style={s.symbolName}>{symbolLabel(group.symbol, data.changed_symbols)}</span>
              <span style={s.callerCount}>{t("callerCount", { count: group.callers.length })}</span>
            </button>
            {open && (
              <div style={s.body}>
                <ul style={s.callers}>
                  {group.callers.map((c) => {
                    const text = `${c.file}:${c.line}`;
                    return (
                      <li key={`${c.file}:${c.line}:${c.name}`} style={s.caller}>
                        <span aria-hidden style={s.callerTick} />
                        <Icon.CornerDownRight size={13} aria-hidden style={{ color: "var(--text-muted)" }} />
                        {repoFullName ? (
                          <a
                            href={githubBlobUrl(repoFullName, ref, c.file, c.line)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={s.callerLink}
                          >
                            {text}
                          </a>
                        ) : (
                          <span style={s.callerLink}>{text}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {group.endpoints_affected.length > 0 && (
                  <div role="list" aria-label={t("chips.endpoints")} style={s.chips}>
                    {group.endpoints_affected.map((e) => (
                      <span key={`e:${e}`} role="listitem" style={s.chip("endpoint")}>
                        <Icon.Globe size={12} aria-hidden />
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {group.crons_affected.length > 0 && (
                  <div role="list" aria-label={t("chips.crons")} style={s.chips}>
                    {group.crons_affected.map((c) => (
                      <span key={`c:${c}`} role="listitem" style={s.chip("cron")}>
                        <Icon.Clock size={12} aria-hidden />
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
