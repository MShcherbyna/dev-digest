import { Suspense } from "react";
import { Skeleton } from "@devdigest/ui";
import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /multi-agent-review/configure. `?pr=<prId>` preselects (AC-14).
   useSearchParams needs a Suspense boundary in the App Router. */
export default function ConfigureRunPage() {
  return (
    <Suspense fallback={<Skeleton height={300} />}>
      <ConfigureRunView />
    </Suspense>
  );
}
