import type { SkillType } from "@devdigest/shared";

export interface SkillForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

/** A skill needs a non-blank name and body (server rejects empty ones). */
export function isValid(form: SkillForm): boolean {
  return form.name.trim().length > 0 && form.body.trim().length > 0;
}

export function isDirty(form: SkillForm, initial: SkillForm): boolean {
  return (
    form.name !== initial.name ||
    form.description !== initial.description ||
    form.type !== initial.type ||
    form.body !== initial.body ||
    form.enabled !== initial.enabled
  );
}
