/** Target languages for finding translation (mirrors `TranslationLanguage` in @devdigest/shared). */
export const LANGUAGE_OPTIONS = [
  { value: "uk", labelKey: "models.languageUk" },
  { value: "ru", labelKey: "models.languageRu" },
] as const;

export const DEFAULT_TRANSLATION_LANGUAGE = "uk";
