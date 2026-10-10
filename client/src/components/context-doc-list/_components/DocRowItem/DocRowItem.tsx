/* DocRowItem — one row of ContextDocList: drag handle, checkbox, name + dir,
   status marker, type badge, keyboard move buttons (attached rows) and Preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { DOC_TYPE_STYLE } from "../../constants";
import { splitPath, type DocRow } from "../../helpers";
import { s } from "../../styles";

export interface DocRowItemProps {
  row: DocRow;
  repoName: string | null;
  reorderable: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragging: boolean;
  previewText: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onPreview: () => void;
  dnd: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

export function DocRowItem({
  row,
  repoName,
  reorderable,
  isFirst,
  isLast,
  dragging,
  previewText,
  onToggle,
  onMove,
  onPreview,
  dnd,
}: DocRowItemProps) {
  const t = useTranslations("context");
  const { name, dir } = splitPath(row.path);
  const canDrag = row.attached && reorderable;
  const typeStyle = row.type ? DOC_TYPE_STYLE[row.type] : null;
  return (
    <li
      draggable={canDrag}
      onDragStart={canDrag ? dnd.onDragStart : undefined}
      onDragOver={canDrag ? dnd.onDragOver : undefined}
      onDrop={canDrag ? dnd.onDrop : undefined}
      onDragEnd={dnd.onDragEnd}
      style={s.row(dragging, row.attached)}
    >
      <span role="img" aria-label={t("list.dragHandle", { path: row.path })} style={s.handle(canDrag)}>
        <Icon.Menu size={14} />
      </span>
      <input
        type="checkbox"
        checked={row.attached}
        aria-label={t("list.attach", { path: row.path })}
        style={s.checkbox(row.attached)}
        onChange={onToggle}
      />
      <span style={s.nameWrap} title={row.path}>
        <span className="mono" style={s.name(row.attached)}>
          {name}
        </span>
        {dir && (
          <span className="mono" style={s.dir}>
            {dir}
          </span>
        )}
        {row.status === "too_large" && (
          <>
            <span style={s.marker}>{t("list.tooLarge")}</span>
            <span style={s.marker}>{t("list.tokens", { count: row.tokens })}</span>
          </>
        )}
        {row.status === "not_found" && (
          <span style={s.marker}>{t("list.notFound", { repo: repoName ?? "" })}</span>
        )}
      </span>
      {typeStyle && row.type && (
        <Badge color={typeStyle.color} bg={typeStyle.bg} style={s.typeBadge}>
          {row.type}
        </Badge>
      )}
      {row.attached && reorderable && (
        <>
          <button
            type="button"
            style={s.moveBtn}
            disabled={isFirst}
            aria-label={t("list.moveUp", { path: row.path })}
            onClick={() => onMove(-1)}
          >
            <Icon.ArrowUp size={12} />
          </button>
          <button
            type="button"
            style={s.moveBtn}
            disabled={isLast}
            aria-label={t("list.moveDown", { path: row.path })}
            onClick={() => onMove(1)}
          >
            <Icon.ArrowDown size={12} />
          </button>
        </>
      )}
      {row.status !== "not_found" && repoName !== null && (
        <button
          type="button"
          style={s.previewBtn(previewText)}
          aria-label={t("list.preview", { path: row.path })}
          onClick={onPreview}
        >
          <Icon.Eye size={14} />
          {previewText && t("list.previewLabel")}
        </button>
      )}
    </li>
  );
}
