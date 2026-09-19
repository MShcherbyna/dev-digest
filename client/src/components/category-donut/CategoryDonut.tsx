/* CategoryDonut — donut + legend (colored square, category, count) for
   findings-by-category. Shared by the skill and agent Stats tabs. Zero-count
   segments are dropped. */
"use client";

import React from "react";
import { PieChart, Pie, Cell } from "recharts";
import { categoryColor, DONUT_SIZE, DONUT_STROKE } from "@/lib/chart-colors";
import { s } from "./styles";

export interface CategoryDonutProps {
  categories: ReadonlyArray<{ category: string; count: number }>;
}

export function CategoryDonut({ categories }: CategoryDonutProps) {
  const segments = categories.filter((c) => c.count > 0);
  return (
    <div style={s.donutRow}>
      <PieChart width={DONUT_SIZE} height={DONUT_SIZE}>
        <Pie
          data={segments}
          dataKey="count"
          nameKey="category"
          cx="50%"
          cy="50%"
          innerRadius={(DONUT_SIZE - DONUT_STROKE) / 2 - DONUT_STROKE / 2}
          outerRadius={(DONUT_SIZE - DONUT_STROKE) / 2 + DONUT_STROKE / 2}
          startAngle={90}
          endAngle={-270}
          isAnimationActive={false}
          stroke="none"
        >
          {segments.map((c, i) => (
            <Cell key={c.category} fill={categoryColor(i)} />
          ))}
        </Pie>
      </PieChart>
      <ul style={s.legend}>
        {segments.map((c, i) => (
          <li key={c.category} style={s.legendRow}>
            <span style={s.swatch(categoryColor(i))} />
            <span style={s.legendLabel}>{c.category}</span>
            <span className="mono tnum" style={s.legendValue}>
              {c.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
