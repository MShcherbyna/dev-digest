/* Test helper: render with next-intl (skills + agents + conventions messages) and the toast
   provider, so component tests don't repeat the provider boilerplate. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../messages/en/skills.json";
import agents from "../../messages/en/agents.json";
import conventions from "../../messages/en/conventions.json";
import common from "../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

export function renderWithIntl(ui: React.ReactElement): RenderResult {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills, agents, conventions, common }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}
