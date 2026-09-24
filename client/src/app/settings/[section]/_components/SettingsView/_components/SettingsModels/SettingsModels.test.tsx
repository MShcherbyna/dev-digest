import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";

const mutate = vi.hoisted(() => vi.fn());
let settings: Record<string, unknown> = {};
vi.mock("@/lib/hooks", () => ({
  useSettings: () => ({ data: settings }),
  useUpdateSettings: () => ({ mutate }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [] }),
}));

import { SettingsModels } from "./SettingsModels";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  settings = {};
});

function renderModels() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsModels />
    </NextIntlClientProvider>,
  );
}

describe("SettingsModels translation row", () => {
  it("lists the Translation feature with a language select defaulting to Ukrainian", () => {
    renderModels();
    expect(screen.getByText("Translation")).toBeInTheDocument();
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("uk");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Ukrainian", "Russian"]);
  });

  it("persists the chosen language to settings.translation_language", () => {
    settings = { translation_language: "uk" };
    renderModels();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ru" } });
    expect(mutate).toHaveBeenCalledWith({ translation_language: "ru" });
  });
});
