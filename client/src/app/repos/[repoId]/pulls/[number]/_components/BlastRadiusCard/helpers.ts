import type { BlastRadiusResponse } from "@/lib/hooks/blast";
import { CALLABLE_KINDS } from "./constants";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Same counting rules as the server summary: symbols = changed symbols, endpoints/crons unique across groups. */
export function blastStats(data: Pick<BlastRadiusResponse, "changed_symbols" | "downstream">): BlastStats {
  return {
    symbols: data.changed_symbols.length,
    callers: data.downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: new Set(data.downstream.flatMap((d) => d.endpoints_affected)).size,
    crons: new Set(data.downstream.flatMap((d) => d.crons_affected)).size,
  };
}

/** Display label of a changed symbol: callables get "()" as in the design. */
export function symbolLabel(name: string, changed: BlastRadiusResponse["changed_symbols"]): string {
  const kind = changed.find((c) => c.name === name)?.kind;
  return kind && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}
