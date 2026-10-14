import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose violations map onto DevDigest-SPECIFIC rule names
// (`rc/impure`) that a competent model will describe in prose but will not spontaneously name
// unless the agent forces a citation. This is
// the discriminating case for the strict-vs-lite A/B: both variants should FIND both problems,
// but only the strict variant (which keeps the "cite the exact documented rule per finding" hard
// rule) should reliably emit the identifier. The checkout diff's textbook violations don't
// discriminate — the model volunteers a layering/DI rule name either way.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "cites the specific documented rule" keeps passing.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of rule `det/layer-service-infra` (domain/ must not import `fastify`)",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of rule `onion/service-new-infra` (a service must not instantiate a repository/adapter; construction belongs in the container)",
      "names the specific documented rule id for EVERY finding (`det/layer-service-infra` for the fastify import, `onion/service-new-infra` for the `new PgCheckoutRepository()`) and the skill section that makes it a violation, rather than describing the problem only in prose",
      "assigns severity `critical` to both findings (severity.md: both rule ids are critical)",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with the verdict `VIOLATIONS`, since at least one finding is critical",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the `det/layer-service-infra` import issue itself (no runtime bug/security finding fabricated as an architecture rule)",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "names the exact rule id `rc/impure` for the fs-import finding rather than only describing it in prose",
      "cites a documented rule or skill/contract source (not only prose) for the skipped-`groundFindings()` finding; it is an intent-level (Pass 2) finding, so no fixed rule id is required",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "assigns a severity (critical/major/minor) to each finding and ends with a verdict (`CONCERNS` or `VIOLATIONS`) consistent with the highest severity reported",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no findings for the benign rename — it does not invent a critical/major/minor finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final verdict is `CLEAN`",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
