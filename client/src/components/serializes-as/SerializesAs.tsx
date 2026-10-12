/* SerializesAs — "SERIALIZES AS" box under the attached docs on the agent and skill
   Context tabs: the heading plus one `- <path>` line per attached path, in order. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { serializeAttachments } from "./helpers";
import { s } from "./styles";

export function SerializesAs({ paths }: { paths: string[] }) {
  const t = useTranslations("context");
  return (
    <>
      <div style={s.label}>{t("serializesAs")}</div>
      <pre className="mono" style={s.box}>
        {serializeAttachments(paths)}
      </pre>
    </>
  );
}
