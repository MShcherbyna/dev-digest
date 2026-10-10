/* ContextDocList — ordered attach/detach list of a repo's discovered markdown
   docs, shared by the agent and skill Context tabs. Every toggle, drop or move
   emits the full new ordered list via `onChange` (the caller persists it
   optimistically). Reordering is disabled while the filter has text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { DocPreviewModal } from "@/components/doc-preview-modal";
import { useProjectContext } from "@/lib/hooks/project-context";
import { DocRowItem } from "./_components/DocRowItem";
import { buildRows, filterRows, move, toggle, tokenTotal } from "./helpers";
import { s } from "./styles";

export interface ContextDocListProps {
  /** Active repository, or null when none is selected. */
  repo: { id: string; name: string } | null;
  attached: string[];
  onChange: (paths: string[]) => void;
  title: string;
  hint: React.ReactNode;
  /** agent: "N of M attached" + labelled Preview button; skill: "N attached" + eye icon. */
  variant: "agent" | "skill";
  footerNote?: string;
  /** Rendered under the list and token footer (e.g. the skill's SERIALIZES AS box). */
  children?: React.ReactNode;
}

export function ContextDocList({ repo, attached, onChange, title, hint, variant, footerNote, children }: ContextDocListProps) {
  const t = useTranslations("context");
  const q = useProjectContext(repo?.id);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const listing = q.data;
  const known = listing?.cloned ? listing.files : undefined;
  const rows = React.useMemo(() => buildRows(attached, known), [attached, known]);
  const filtering = filter.trim() !== "";
  const visible = filterRows(rows, filter);
  const reorderable = !filtering;

  if (repo && q.isError) {
    return <ErrorState title={t("list.errorTitle")} body={t("list.errorBody")} onRetry={() => void q.refetch()} />;
  }
  if (repo && q.isLoading) return <Skeleton height={200} />;

  const noClone = !repo || !listing?.cloned;
  // Both tabs show "N of M attached" (M = every row listed, incl. attached-but-missing ones).
  const count = t("list.countOf", { attached: attached.length, total: rows.length });
  const attachedVisible = visible.filter((r) => r.attached);

  const moveBy = (path: string, dir: -1 | 1) => {
    const i = attached.indexOf(path);
    const target = attached[i + dir];
    if (i !== -1 && target) onChange(move(attached, path, target));
  };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
        <span className="tnum" style={s.count}>
          {count}
        </span>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("list.filterPlaceholder")}
            aria-label={t("list.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{hint}</p>

      {noClone && (
        <div style={s.notice}>{!repo ? t("list.noRepo") : t("list.notCloned", { repo: repo.name })}</div>
      )}
      {listing?.truncated && <div style={s.notice}>{t("list.truncated", { total: listing.total })}</div>}
      {!noClone && rows.length === 0 && <div style={s.notice}>{t("list.empty", { glob: listing?.glob ?? "" })}</div>}
      {rows.length > 0 && visible.length === 0 && <div style={s.notice}>{t("list.noMatch")}</div>}

      <ul style={s.list}>
        {visible.map((r) => {
          const ai = attachedVisible.indexOf(r);
          return (
            <DocRowItem
              key={r.path}
              row={r}
              repoName={repo?.name ?? null}
              reorderable={reorderable}
              isFirst={ai === 0}
              isLast={ai === attachedVisible.length - 1}
              dragging={dragPath === r.path}
              previewText={variant === "agent"}
              onToggle={() => onChange(toggle(attached, r.path))}
              onMove={(dir) => moveBy(r.path, dir)}
              onPreview={() => setPreviewPath(r.path)}
              dnd={{
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", r.path);
                  setDragPath(r.path);
                },
                onDragOver: (e) => {
                  if (dragPath && dragPath !== r.path) e.preventDefault();
                },
                onDrop: (e) => {
                  e.preventDefault();
                  if (dragPath) {
                    const next = move(attached, dragPath, r.path);
                    if (next !== attached) onChange(next);
                  }
                  setDragPath(null);
                },
                onDragEnd: () => setDragPath(null),
              }}
            />
          );
        })}
      </ul>

      <div style={s.footer}>
        <span className="mono" style={s.tokens}>
          {t("list.tokens", { count: tokenTotal(rows) })}
        </span>
        {footerNote && <span>{footerNote}</span>}
      </div>
      {children}
      {repo && previewPath && (
        <DocPreviewModal repoId={repo.id} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
