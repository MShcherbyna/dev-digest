/* SafeSparkline — the vendored Sparkline divides by (n - 1), so one point yields NaN.
   0 points render nothing; 1 point is duplicated into a flat line. */
import React from "react";
import { Sparkline } from "@devdigest/ui";

export function SafeSparkline({ data, color, w = 84, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length === 0) return null;
  const safe = data.length === 1 ? [data[0]!, data[0]!] : data;
  return <Sparkline data={safe} color={color} w={w} h={h} />;
}
