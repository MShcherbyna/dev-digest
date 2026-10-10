/** Badge colours per doc type (CSS tokens only): specs blue, docs green, insights amber. */
export const DOC_TYPE_STYLE = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
} as const;
