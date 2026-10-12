import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (Project Context). Thin entry — the view,
   its panels, styles, helpers and i18n are colocated under _components. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
