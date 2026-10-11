import React from "react";
import { Skeleton } from "@devdigest/ui";
import { SECTION_KEYS } from "../../constants";
import { s } from "../../styles";

export function TourSkeleton() {
  return (
    <div style={s.page} aria-busy="true">
      <div style={s.rail} />
      <div style={s.main}>
        <Skeleton width={320} height={30} />
        <Skeleton width={260} height={14} />
        {SECTION_KEYS.map((k) => (
          <Skeleton key={k} height={120} style={{ borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}
