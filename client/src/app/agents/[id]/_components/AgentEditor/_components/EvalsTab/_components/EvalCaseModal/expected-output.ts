/* Client mirror of the server's ExpectedOutput contract (server/src/modules/eval/schemas.ts),
   used only for the live valid/invalid badge. The server stays authoritative. */
import { z } from "zod";

const isSafePath = (p: string) =>
  !p.startsWith("/") && !p.startsWith("\\") && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes("..");

const ExpectedItemSchema = z
  .object({
    expect: z.enum(["must_find", "must_not_flag"]).default("must_find"),
    file: z.string().min(1).max(1000).refine(isSafePath, "file must be a relative path inside the repo"),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1).optional(),
    severity: z.enum(["CRITICAL", "WARNING", "SUGGESTION"]).optional(),
    category: z.string().max(64).optional(),
    title: z.string().max(300).optional(),
  })
  .strict()
  .refine((i) => i.end_line === undefined || i.end_line >= i.start_line, {
    message: "end_line must be >= start_line",
    path: ["end_line"],
  });

export const ExpectedOutputSchema = z.array(ExpectedItemSchema).max(200);

export type ExpectedParse =
  | { ok: true; items: z.infer<typeof ExpectedOutputSchema> }
  | { ok: false; reason: "json" | "contract"; detail: string };

/** JSON text → validated items; never trusts the parsed value. */
export function parseExpected(text: string): ExpectedParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json", detail: "" };
  }
  const r = ExpectedOutputSchema.safeParse(raw);
  if (r.success) return { ok: true, items: r.data };
  const issue = r.error.issues[0];
  const path = issue?.path.join(".") ?? "";
  return { ok: false, reason: "contract", detail: `${path ? `${path}: ` : ""}${issue?.message ?? ""}` };
}
