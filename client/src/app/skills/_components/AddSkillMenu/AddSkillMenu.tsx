/* AddSkillMenu — "+ Add Skill ▾" dropdown: Create new / Import .md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";

export function AddSkillMenu({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  const t = useTranslations("skills");
  return (
    <Dropdown
      width={200}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {t("page.addSkill")}
        </Button>
      }
      items={[
        { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
        { label: t("page.menu.import"), icon: "Upload", onClick: onImport },
      ]}
    />
  );
}
