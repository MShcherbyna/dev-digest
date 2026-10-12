/* FileListPanel — left panel: repo header, refresh, the sorted doc list (name, directory,
   area badge per row) and the index footer. Read-only: no add/upload/edit controls. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import { DOC_TYPE_STYLE } from "@/components/context-doc-list/constants";
import type { ContextListing } from "@/lib/types";
import { areaOf, baseName, dirOf, relativeTime, sortFiles } from "../../helpers";
import { s } from "../../styles";

export interface FileListPanelProps {
  listing: ContextListing;
  repoName: string;
  selected: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}

/** Area badge colours: "docs" keeps its green, every other area is neutral. */
function areaStyle(area: string) {
  return area === "docs" ? DOC_TYPE_STYLE.docs : { color: "var(--text-secondary)", bg: "var(--bg-hover)" };
}

export function FileListPanel({ listing, repoName, selected, onSelect, onRefresh }: FileListPanelProps) {
  const t = useTranslations("context");
  const files = React.useMemo(() => sortFiles(listing.files), [listing.files]);
  return (
    <aside style={s.left} aria-label={t("page.title")}>
      <div style={s.leftHead}>
        <div style={s.leftHeadText}>
          <div style={s.caps}>{t("page.panelTitle")}</div>
          <div className="mono" style={s.repoName} title={repoName}>
            {repoName}
          </div>
        </div>
        <IconBtn icon="RefreshCw" label={t("page.refresh")} onClick={onRefresh} />
      </div>
      <div style={s.list}>
        {listing.truncated && <div style={s.notice}>{t("list.truncated", { total: listing.total })}</div>}
        {files.map((f) => {
          const active = f.path === selected;
          const area = areaOf(f.path);
          const style = areaStyle(area);
          return (
            <button
              key={f.path}
              type="button"
              title={f.path}
              aria-label={f.path}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(f.path)}
              style={s.item(active)}
            >
              <Icon.FileText size={16} style={s.itemIcon(active)} />
              <span style={s.itemText}>
                <span className="mono" style={s.itemName}>
                  {baseName(f.path)}
                </span>
                {dirOf(f.path) && (
                  <span className="mono" style={s.itemDir}>
                    {dirOf(f.path)}
                  </span>
                )}
              </span>
              <Badge color={style.color} bg={style.bg} style={s.areaBadge}>
                {area}
              </Badge>
            </button>
          );
        })}
      </div>
      <div style={s.footer}>
        <span style={s.footerLine}>
          <span style={s.dot} />
          {t("page.indexed", { count: files.length })}
        </span>
        <span>{t("page.lastScanned", { when: relativeTime(listing.scanned_at) })}</span>
      </div>
    </aside>
  );
}
