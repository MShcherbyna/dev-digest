/* Route: /skills/:id — skill detail; `id === "new"` is the Create form. Tab in ?tab=. */
"use client";

import { useParams } from "next/navigation";
import { SkillsWorkspace } from "../_components/SkillsWorkspace";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillsWorkspace id={id} />;
}
