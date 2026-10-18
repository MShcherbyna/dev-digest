/* ci-errors — maps an API failure of the install / remove calls to a user-facing message
   (AC-16, AC-36). Shared by the wizard's Install step and the Remove dialog. */
import { ApiError } from "@/lib/api";
import { KNOWN_ERROR_CODES, PERMISSION_KEYS } from "./constants";

/** Minimal translator shape (`useTranslations("ci")`), so this stays a plain function. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The `ci.ciErrors.*` key for an error, plus the missing token permission when it names one. */
export function ciErrorInfo(error: unknown): { key: string; permission?: string } {
  if (!(error instanceof ApiError)) return { key: "generic" };
  if (error.status === 0) return { key: "network" };
  if (error.status === 429) return { key: "rate_limited" };
  const code = error.code;
  if (!code || !KNOWN_ERROR_CODES.has(code)) return { key: "generic" };
  if (code === "github_permission") {
    const permission = (error.details as { permission?: unknown } | null | undefined)?.permission;
    if (typeof permission === "string" && PERMISSION_KEYS.has(permission)) return { key: code, permission };
    return { key: "github_permission_any" };
  }
  return { key: code };
}

/** Error code of an `ApiError`, `undefined` for anything else. */
export function ciErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

export function ciErrorMessage(t: Translate, error: unknown): string {
  const { key, permission } = ciErrorInfo(error);
  if (key === "github_permission" && permission) {
    return t("ciErrors.github_permission", { permission: t(`ciErrors.permission.${permission}`) });
  }
  return t(`ciErrors.${key}`);
}
