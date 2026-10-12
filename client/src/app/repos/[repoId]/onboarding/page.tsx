import { OnboardingTourView } from "./_components/OnboardingTourView";

/* Route: /repos/:repoId/onboarding (Onboarding Tour). Thin entry — the view,
   its sections, hooks, styles and helpers are colocated under _components. */
export default function OnboardingTourPage() {
  return <OnboardingTourView />;
}
