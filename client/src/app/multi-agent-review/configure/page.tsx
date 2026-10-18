"use client";

import { Suspense } from "react";
import { Skeleton } from "@devdigest/ui";
import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /multi-agent-review/configure. `?pr=<prId>` preselects (AC-14).
   useSearchParams needs a Suspense boundary in the App Router.
   "use client": @devdigest/ui is a client-only barrel (its chart module
   uses recharts, which breaks when pulled into an RSC bundle) — every
   other page.tsx importing from it marks itself "use client" too. */
export default function ConfigureRunPage() {
  return (
    <Suspense fallback={<Skeleton height={300} />}>
      <ConfigureRunView />
    </Suspense>
  );
}
