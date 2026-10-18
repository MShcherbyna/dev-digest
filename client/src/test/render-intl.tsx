/* Test helper: render with next-intl (skills, agents, conventions, brief, prReview, shell, eval, ci ... messages) and the toast
   provider, so component tests don't repeat the provider boilerplate. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../messages/en/skills.json";
import agents from "../../messages/en/agents.json";
import conventions from "../../messages/en/conventions.json";
import common from "../../messages/en/common.json";
import context from "../../messages/en/context.json";
import onboarding from "../../messages/en/onboarding.json";
import brief from "../../messages/en/brief.json";
import prReview from "../../messages/en/prReview.json";
import shell from "../../messages/en/shell.json";
import evalMessages from "../../messages/en/eval.json";
import runs from "../../messages/en/runs.json";
import ci from "../../messages/en/ci.json";
import { ToastProvider } from "@/lib/toast";

export function renderWithIntl(ui: React.ReactElement): RenderResult {
  return render(
      <NextIntlClientProvider
          locale="en"
          messages={{ skills, agents, conventions, common, context, onboarding, brief, prReview, shell, eval: evalMessages, ci, runs}}
      >
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}
