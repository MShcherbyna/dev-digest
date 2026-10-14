import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (root CLAUDE.md + per-package
 * CLAUDE.md + skills + subagents, loaded via settingSources:["project"]) behaves as documented.
 * Organized by scenario, not by a single artifact, because these behaviors are cross-cutting.
 *
 * Every expected path below was checked to exist in the repo. If a doc is renamed, the matching
 * case fails with "<file> not read" — update the path here, not the assertion.
 *
 * Budget: 17 Claude sessions (7 workflow + 10 skill activation, see the last section); one session each, stops early once evidence is in.
 *   - 2 × root CLAUDE.md "Read when" routing
 *   - 3 × nested package CLAUDE.md (server, client, both)
 *   - 1 × do-not-touch (vendored path)
 *   - 1 × planning dispatch (implementation-planner)
 *
 * Nested package instructions: Claude Code auto-loads server/ and client/ CLAUDE.md, but that is not a
 * Read tool call, so it never appears in the trace. The nested cases therefore assert the file the agent
 * is routed to and reads explicitly (AGENTS.md, then README.md) — they test following the pointers, not
 * the auto-load. `workflow-retro` is manual-invocation only, so it has no activation check.
 *
 * Gaps (the DSL cannot assert these yet): that a Write/Edit was *not* attempted, the commit-prefix
 * rule, and "file X was NOT read" for a trace. The do-not-touch case is therefore read-only-safe
 * (WORKFLOW_ALLOWED_TOOLS has no Write/Edit) and asserts the routing, not the refusal text.
 */
export const cases: WorkflowCase[] = [
  // --- root CLAUDE.md "Read when" routing -------------------------------------------------------
  {
    kind: "trace",
    // Prompt pushes toward CONSULTING docs rather than exploring source — exploring code is what
    // makes routing checks flaky.
    name: "cross-package change follows CLAUDE.md routing to README architecture",
    prompt:
      "Я хочу змінити те, як server і client спілкуються між собою (контракт між пакетами). " +
      "Перш ніж торкатися коду — звірся з настановами цього репо (CLAUDE.md) щодо того, " +
      "який документ треба прочитати для таких змін, і прочитай саме його.",
    expectFilesRead: ["README.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "reviewer persona task follows CLAUDE.md routing to agent-prompts README",
    prompt:
      "Я збираюся поправити системний промпт одного з агентів-рев'юерів. Перш ніж щось міняти — " +
      "звірся з настановами цього репо (CLAUDE.md), де описані ці промпти, і прочитай відповідний документ.",
    expectFilesRead: ["docs/agent-prompts/README.md"],
    maxTurns: 6,
  },

  // --- nested package CLAUDE.md -----------------------------------------------------------------
  {
    kind: "trace",
    name: "server task reads server/AGENTS.md and follows its README link",
    prompt:
      "Я хочу додати новий модуль у server/src/modules/. Відкрий server/src/modules і спершу прочитай " +
      "настанови пакета server (їхній AGENTS.md), а потім той документ, на який вони посилаються " +
      "для API-поверхні та DI. Код ще не пиши.",
    expectFilesRead: ["server/AGENTS.md", "server/README.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "client task reads client/AGENTS.md and follows its README link",
    prompt:
      "Я хочу додати новий компонент на сторінку в client/src/app. Відкрий client/src/app і спершу " +
      "прочитай настанови пакета client (їхній AGENTS.md), а потім той документ, на який вони посилаються " +
      "для мапи маршрутів і API-викликів. Код ще не пиши.",
    expectFilesRead: ["client/AGENTS.md", "client/README.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    // Guards against the agent applying one package's rules everywhere: a task spanning both
    // packages must load BOTH nested instruction files.
    name: "task spanning server and client reads both package AGENTS.md files",
    prompt:
      "Мені треба додати нове поле в API-відповідь у server/src/modules/ і показати його в UI у " +
      "client/src/app. Для кожного з двох пакетів спершу прочитай його власні настанови (AGENTS.md " +
      "у теці пакета). Код ще не пиши.",
    expectFilesRead: ["server/AGENTS.md", "client/AGENTS.md"],
    maxTurns: 6,
  },

  // --- do-not-touch -----------------------------------------------------------------------------
  {
    kind: "trace",
    // The tool list is read-only, so nothing can be edited; this asserts the agent consults the
    // package rules (where do-not-touch is stated) before acting on a vendored path.
    name: "request to patch vendored shared code consults server/AGENTS.md first",
    prompt:
      "Виправ баг прямо у server/src/vendor/shared — там неправильна схема. Перш ніж щось робити, " +
      "прочитай настанови пакета server (їхній AGENTS.md) і скажи, чи можна редагувати цей шлях.",
    expectFilesRead: ["server/AGENTS.md"],
    maxTurns: 6,
  },

  // --- planning dispatch ------------------------------------------------------------------------
  {
    kind: "trace",
    // CLAUDE.md: a plan request is an explicit request for the implementation-planner agent —
    // launched directly, without drafting a plan first. The spec exists (server/specs).
    name: "plan request dispatches implementation-planner",
    prompt:
      "Згенеруй план імплементації за специфікацією server/specs/run-cost-badge.md. " +
      "Сам план не пиши — відправ це відповідному агенту.",
    expectSubagents: ["implementation-planner"],
    maxTurns: 6,
  },

  // === Skill activation (2 checks per skill; positives maxTurns 5, near-misses 4) =========================================
  // Does each project-authored skill engage on a prompt matching its `description`, and stay out on
  // a near-miss? Positive = `trace` + expectSkills (stops the moment the skill engages, so a pass is
  // cheap); near-miss = `activation` + shouldActivate:false (same topic, wrong intent).
  // 5 skills x 2 = 10 sessions. Skipped on purpose: `run-plan` and `pr-self-review` (side effects)
  // and third-party skills (fastify, zod, drizzle, react-best-practices, ...), which are not ours.
  // "Engaged" = a Skill tool call OR reading the skill's SKILL.md (`activated` in src/dsl/case.ts).
  // Prompts never name the skill, so a pass means the description routed it.
  // --- onion-architecture (backend layering) ----------------------------------------------------
  {
    kind: "trace",
    name: "onion-architecture engages on a new backend module",
    prompt:
      "Мені треба створити новий модуль у server/src/modules для експорту ревʼю: роут, сервіс і " +
      "репозиторій. Як правильно розкласти залежності між шарами? Код ще не пиши.",
    expectSkills: ["onion-architecture"],
    maxTurns: 5,
  },
  {
    kind: "activation",
    name: "onion-architecture stays out of a reviewer-core (non-server) question",
    prompt: "Як assemblePrompt у reviewer-core збирає необов'язкові слоти промпту?",
    skill: "onion-architecture",
    shouldActivate: false,
    maxTurns: 6,
  },

  // --- react-frontend-architecture (where things live in client/) -------------------------------
  {
    kind: "trace",
    name: "react-frontend-architecture engages on 'where do I put this'",
    prompt:
      "У client є великий компонент на 400 рядків. Куди виносити константи, хелпери та хуки, і як " +
      "розбити його на частини за конвенціями цього репо? Код ще не пиши.",
    expectSkills: ["react-frontend-architecture"],
    maxTurns: 5,
  },
  {
    kind: "activation",
    name: "react-frontend-architecture stays out of a hooks-behaviour question",
    prompt: "Чому useEffect у React спрацьовує двічі в dev-режимі і як це правильно обробити?",
    skill: "react-frontend-architecture",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- design (UI visuals) ----------------------------------------------------------------------
  {
    kind: "trace",
    name: "design engages on a UI look-and-feel task",
    prompt:
      "Треба зверстати нову картку на сторінці репо — які кольори, відступи та типографіку " +
      "використовувати, щоб вона виглядала як решта інтерфейсу? Код ще не пиши.",
    expectSkills: ["design"],
    maxTurns: 5,
  },
  {
    kind: "activation",
    name: "design stays out of a component-structure question",
    prompt: "Куди в React-компоненті краще винести константи та хелпери, щоб файл не розростався?",
    skill: "design",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- engineering-insights (record a finding) --------------------------------------------------
  {
    kind: "trace",
    name: "engineering-insights engages on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    expectSkills: ["engineering-insights"],
    maxTurns: 5,
  },
  {
    kind: "activation",
    name: "engineering-insights stays out of a repo-unrelated theory question",
    prompt: "Поясни теорію: чим косинусна відстань відрізняється від евклідової (L2) для порівняння векторів?",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- dependency-checker (read-only report) ----------------------------------------------------
  {
    kind: "trace",
    name: "dependency-checker engages on a dependency audit request",
    prompt: "Перевір залежності репозиторію: що найважче в node_modules і чи є невикористані пакети?",
    expectSkills: ["dependency-checker"],
    maxTurns: 5,
  },
  {
    kind: "activation",
    name: "dependency-checker stays out of a single-package install question",
    prompt: "Як додати пакет date-fns у client і чим pnpm add відрізняється від pnpm install?",
    skill: "dependency-checker",
    shouldActivate: false,
    maxTurns: 4,
  },
];
