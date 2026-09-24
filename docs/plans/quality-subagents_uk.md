# План розробки: субагенти якості (test-writer, architecture-reviewer, plan-verifier, doc-writer)

## 1. Мета й обсяг

**Мета.** Додати в `.claude/agents/` чотири проєктні субагенти Claude Code,
які розширюють наявний конвеєр `planner → implementer`. Вони дотримуються
конвенцій `planner.md`, `implementer.md` і `researcher.md`: ті самі поля
frontmatter, окремий guard-хук `PreToolUse` для кожного агента, підключений
у frontmatter, вихід у форматі звіту, `.claude/agents/README.md` як мапа.

1. **test-writer** пише тести для UI (`client/`) і бекенду (`server/`,
   `reviewer-core/`) та застосовує відповідні скіли проєкту.
2. **architecture-reviewer** не має права запису. Перевіряє архітектурні межі
   й повертає знахідки з доказами.
3. **plan-verifier** звіряє готовий код з **усіма** пунктами плану й вимог і
   не підміняє їх загальними порадами.
4. **doc-writer** документує реалізовані фічі. Перетворює план чи інший
   матеріал на документацію з діаграмами й знає, в які розділи docs писати.

Результат: 4 файли агентів, 3 нові guard-хуки й оновлений
`.claude/agents/README.md`. Цільовий конвеєр після змін:

```
task ─► planner ─► plan ─► implementer ─► test-writer ─► architecture-reviewer ─┐
                                                        plan-verifier ◄──────────┘
                                                             │ COMPLETE
                                                             ▼
                                                         doc-writer
researcher ── standalone
```

**Поза обсягом.**
- Агента security-reviewer немає. Безпекове рев'ю й далі «роблять інші
  агенти», це поза межами задачі.
- Без змін у `planner.md`, `implementer.md`, `researcher.md`, скілі
  `pr-self-review`, `checks.sh`, `settings.json`, `settings.local.json`.
- Без конфігурації dependency-cruiser / ArchUnitTS (`.dependency-cruiser.cjs`)
  у цій задачі. `server/` уже залежить від `dependency-cruiser` для
  repo-intel, але конфіг правил — окреме рішення (див. §9 П5).
- Без нових скілів проєкту. Агенти використовують наявні.
- test-writer не пише e2e-флоу (`e2e/specs*/*.flow.json`), див. §9 П7.
- Без змін коду застосунку, БД, контрактів чи UI. Браузерна перевірка для
  самої задачі не потрібна.

## 2. Прочитаний контекст

Прочитані файли:
- `/CLAUDE.md` = `/AGENTS.md` (однаковий вміст), `server/AGENTS.md`,
  `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`.
- `INSIGHTS.md` (кореневий), `server/INSIGHTS.md`, `client/INSIGHTS.md`,
  `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md` (секції порожні).
- `.claude/agents/planner.md`, `implementer.md`, `researcher.md`, `README.md`.
- `.claude/hooks/planner-guard.sh`, `implementer-guard.sh`,
  `pr-self-review-gate.sh`, `duration-hook.sh`; `.claude/settings.json`,
  `.claude/settings.local.json`.
- `.claude/skills/README.md` (каталог із 15 скілів) і SKILL.md скілів
  `engineering-insights`, `onion-architecture`, `react-frontend-architecture`,
  `fastify-best-practices` (+ `rules/testing.md`), `react-testing-library`,
  `mermaid-diagram`, `design`, `security` (перші 80 рядків), `pr-self-review`
  (+ `routing.md`, `severity.md`, `scripts/checks.sh`).
- `TESTING.md`; `docs/agent-prompts/README.md`; `server/docs/README.md`,
  `client/docs/README.md`, `reviewer-core/docs/README.md`,
  `e2e/docs/README.md`, `server/specs/README.md`; списки заголовків README
  у корені, `server/`, `client/`, `reviewer-core/`, `e2e/`,
  `server/src/modules/repo-intel/README.md`.
- Налаштування тестів: `client/package.json`, `client/vitest.config.ts`,
  `client/src/test/user.ts`, `client/src/test/render-intl.tsx`,
  `client/src/app/skills/_components/SkillsList/SkillsList.test.tsx`;
  `server/package.json`, `server/vitest.config.ts`,
  `server/test/helpers/pg.ts`, `server/test/routes-smoke.test.ts`,
  `server/test/skills.it.test.ts`; перелік `server/test/*.ts` і
  `reviewer-core/test/*.ts`.

Релевантні записи (цитати без перекладу):
- `/CLAUDE.md` "Naming conventions": "**Tests**: co-located next to what they
  test, same base name — `<Name>.test.tsx` (client) / `<name>.test.ts` (server
  unit) / `<name>.it.test.ts` (server integration, Testcontainers-backed — the
  `.it.` infix is how `test/` distinguishes the two)."
- `/CLAUDE.md` "Do-not-touch": "`*/vendor/shared/**`, `client/src/vendor/ui/**`
  … `server/src/db/migrations/**` … `*/pnpm-lock.yaml`".
- `client/INSIGHTS.md` (2026-09-20): "`@testing-library/user-event` is NOT a
  client dependency (only `@testing-library/react` + `jest-dom`), and lockfiles
  are do-not-touch, so component tests use the `fireEvent`-based shim
  `src/test/user.ts` (`click`/`type`/`clear`/`upload`; `type` appends in one
  change event) and `src/test/render-intl.tsx`".
- `client/AGENTS.md` "Gotchas": "Component tests mock `fetch` (vitest + jsdom);
  they don't need the API or a browser. Real browser journeys belong in
  [`../e2e`]".
- `TESTING.md`: "We do **not** chase line coverage. Each suite covers the
  *kinds* of things that can break in that layer — one happy path plus the
  edge that actually matters per workflow"; "A DB-backed test that imports
  `test/helpers/pg.ts` must use the `.it.test.ts` suffix."; "Reach for
  `src/adapters/mocks.ts` (MockLLMProvider, MockGitClient) rather than real
  network/keys."
- `server/INSIGHTS.md` (2026-09-20): "`assemblePrompt` unit tests … live in
  `server/test/prompt-*.test.ts` as well as `reviewer-core/test/` … Grep
  before changing a slot".
- Кореневий `INSIGHTS.md`, Tool & Library Notes (2026-09-18): "`pnpm` is not on
  `PATH`, and `corepack pnpm` fails with `EACCES` … use `npx --yes pnpm@10
  <cmd>` instead".
- Кореневий `INSIGHTS.md`, Decisions (2026-09-18): "Invoke best-practices skills
  proactively during implementation … adjacent code shows what was done before,
  not whether it was a best practice worth repeating."
- `server/docs/README.md`: "one file per topic (e.g. `repo-intel-indexing.md`,
  `grounding-gate.md`). Link a new file from [`../AGENTS.md`] under "Read when"
  once it exists; don't duplicate what `../README.md` already covers." (те саме
  правило в `client/docs/`, `reviewer-core/docs/`, `e2e/docs/`).
- `/CLAUDE.md` "Read when": "read [README.md](README.md#architecture) (mermaid
  diagram lives there — do not duplicate it here)."
- Скіл `engineering-insights`: "When an entry becomes stable reference
  material, promote it into `<module>/docs/` and delete it here."
- `.claude/agents/README.md` "Adding an agent": "Add `<name>.md` with
  frontmatter (`name`, `description`, `model`, `tools` / `disallowedTools`,
  optional `skills`, `hooks`), then add a row and a card here."
- `pr-self-review/severity.md`: ідентифікатори правил `det/layer-route-repo`,
  `det/layer-service-infra`, `det/client-imports-server`, `onion/raw-rows`,
  `onion/service-new-infra`, `frontend/server-client-boundary`,
  `next/server-leak` тощо. "Reuse the ids above whenever one applies so
  waivers stay stable."

Факти з коду, які промпти агентів мають закласти:
- Серверні тести лежать **не** поруч із кодом, а в `server/test/*.ts`.
  `server/vitest.config.ts` включає `test/**/*.test.ts` і `src/**/*.test.ts`,
  але жодного `src/**/*.test.ts` немає. Тести reviewer-core лежать у
  `reviewer-core/test/`. Клієнтські тести розташовані поруч із кодом.
- Тести маршрутів сервера використовують `buildApp({ config, overrides })` +
  `app.inject(...)` + `await app.close()` (`server/test/routes-smoke.test.ts:15-19`).
  Інтеграційні тести перевіряють `dockerAvailable()` і використовують
  `startPg()` + `seed()` (`server/test/skills.it.test.ts:10-28`).
- Правило тестування у `fastify-best-practices` показує `node:test`, а цей
  репозиторій використовує vitest (`server/package.json` `"test": "vitest run"`).
  Діє правило репозиторію.
- SKILL `react-testing-library` вимагає `@testing-library/user-event` і MSW,
  але жодного з них не встановлено (`client/package.json`). Наявні тести
  використовують `import userEvent from "@/test/user"` і `renderWithIntl`
  (`SkillsList.test.tsx:3-4`).
- `implementer-guard.sh:7-14` пропускає виклик при помилці (**fail open**):
  якщо JSON не розпарсився, `tool` порожній і скрипт виходить з 0. Нові
  guard-хуки мають блокувати в такому разі (fail closed).
- Єдині розділи кореневого `docs/` — `docs/agent-prompts/` і `docs/plans/`.
  Кожен пакет має `docs/README.md`, `specs/README.md`, `README.md`,
  `AGENTS.md`, `INSIGHTS.md`. Прецедент README на рівні модуля:
  `server/src/modules/repo-intel/README.md` (містить mermaid-діаграму конвеєра).

## 3. Модулі, яких стосуються зміни

Лише інструментарій репозиторію (`.claude/`). Код пакетів не змінюється.

- `.claude/agents/test-writer.md` (**новий**): визначення агента.
- `.claude/agents/architecture-reviewer.md` (**новий**): визначення агента.
- `.claude/agents/plan-verifier.md` (**новий**): визначення агента.
- `.claude/agents/doc-writer.md` (**новий**): визначення агента.
- `.claude/hooks/readonly-bash-guard.sh` (**новий**): allowlist для
  PreToolUse(Bash) з двома режимами: `git` (architecture-reviewer) і `verify`
  (plan-verifier).
- `.claude/hooks/test-writer-guard.sh` (**новий**): guard
  PreToolUse(Bash|Edit|Write) для test-writer.
- `.claude/hooks/doc-writer-guard.sh` (**новий**): guard PreToolUse(Edit|Write)
  для doc-writer.
- `.claude/agents/README.md` (**змінюється**): рядки огляду, workflow,
  картки, джерела (репозиторій і зовнішні).
- Кореневий `INSIGHTS.md` (**змінюється за умови**): лише якщо з'явиться щось
  неочевидне (фільтр engineering-insights).

## 4. Контракти, яких стосуються зміни

немає. Жодних Zod-схем, API, схеми БД чи спільних типів. Вендорні копії не
зачіпаються.

Неявні контракти між агентами (це входи й виходи, а не код):
- test-writer, architecture-reviewer і plan-verifier читають розділи «Done» /
  «Handoff to review» **Implementation Report** (`implementer.md:71-90`) і
  10-розділовий формат **Development Plan** (`planner.md:74-99`). Обидва
  формати не змінюються.
- plan-verifier читає `docs/plans/<feature>_en.md`. Англійська копія
  канонічна, `_uk` — переклад.
- doc-writer читає план, специфікації (`<pkg>/specs/<feature>.md`), звіт
  plan-verifier і код.

## 5. Скіли для implementer

| Скіл | Що регулює | Ключові правила для цієї задачі |
|---|---|---|
| engineering-insights | Крок 0 (ініціація) і крок 12 (запис) | Спершу прочитати кореневий `INSIGHTS.md` (робота в `.claude/` зачіпає кілька пакетів). Записати щонайбільше 3 пункти, лише неочевидні, і спершу перевірити дублікати. |
| security | Кроки 1–3 (guard-хуки) | Fail closed: помилка парсингу чи невідомий інструмент означає exit 2, а не дозвіл. `command` у Bash вважати текстом, який контролює атакувальник (A05 injection). Якірні allowlist-и надійніші за denylist-и. Відхиляти shell-метасимволи ще до зіставлення. |
| react-testing-library | Крок 5 (тіло промпту test-writer) | Промпт зберігає пріоритет запитів (`getByRole` першим, `getByTestId` останнім), `screen`, `findBy`, «1-3 flow-тести на компонент» і «mock at boundaries only». Промпт також називає винятки репозиторію (шим `@/test/user`, без MSW), щоб не суперечити репозиторію. |
| onion-architecture | Кроки 5, 6 (тіла test-writer і architecture-reviewer) | Тести: "Domain/application: unit tests (`*.test.ts`) with in-memory fake ports. Infrastructure: `*.it.test.ts` with Testcontainers." Пункти 1–10 Review checklist — правила оцінки для architecture-reviewer. |
| react-frontend-architecture | Крок 6 (тіло architecture-reviewer) | Review checklist 1–7. "One-way imports: shared → features → app". "`'use client'` … mark the smallest file". |
| fastify-best-practices | Крок 5 (тіло test-writer) | `rules/testing.md`: використовувати `inject()` і закривати застосунок. Виняток репозиторію: vitest, а не `node:test`. |
| mermaid-diagram | Крок 8 (тіло doc-writer); крок 9 (блок workflow у README) | "Don't exceed ~20 nodes", "Label edges", "Wrap in … `mermaid` code blocks", тип діаграми за Decision Guide. |

Не застосовуються: zod, drizzle-orm-patterns, postgresql-table-design,
next-best-practices, react-best-practices, typescript-expert, design,
pr-self-review. Жоден із них не регулює файли, які змінює цей план. Деякі з них
згадуються *всередині* промптів агентів, див. §7.

## 6. Архітектурні обмеження

- **Конвенція файлу агента** (з `planner.md`, `implementer.md`): YAML
  frontmatter з `name`, `description` (у лапках, каже, *коли* делегувати),
  `model`, `effort`, `maxTurns`, `tools`, `disallowedTools` (завжди містить
  `Agent`, щоб агент не запускав вкладених агентів), необов'язкові `skills` і
  `hooks.PreToolUse`, підключені через
  `"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/<name>.sh"`. Тіло починається
  абзацом про роль, далі йдуть розділи `##`, наприкінці — шаблон звіту в
  блоці коду.
- **Конвенція хука** (з `planner-guard.sh`, `implementer-guard.sh`):
  `#!/bin/bash`; коментар-заголовок називає агента й каже "wired in its
  frontmatter, so it does not affect other sessions"; JSON парситься через
  `python3`; exit 2 і повідомлення в stderr з префіксом `<hook-name>:`
  блокують виклик, exit 0 дозволяє. Нові guard-и до того ж **fail closed**
  (§5 security).
- **Агенти лише для читання.** За документацією субагентів, `Bash` сам по собі
  не є read-only. Тому architecture-reviewer і plan-verifier отримують
  `disallowedTools: Write, Edit, NotebookEdit, Agent`, а кожен виклик Bash
  проходить через `readonly-bash-guard.sh` (якірний allowlist).
- **Хук на рівні агента**: хуки підключаються у frontmatter агента, ніколи не
  в `.claude/settings.json` (наявне рішення, README, розділ "Permissions").
- **Do-not-touch** шляхи (`*/vendor/shared/**`, `client/src/vendor/ui/**`,
  `server/src/db/migrations/**`, `*/pnpm-lock.yaml`) мають блокувати й guard-и
  test-writer і doc-writer.
- **Межі відповідальності між агентами** (жоден артефакт не пишуть двоє
  агентів):
  - `docs/plans/**`: лише planner.
  - `INSIGHTS.md`: implementer і test-writer (engineering-insights).
    doc-writer лише *пропонує* перенесення.
  - `<pkg>/specs/**`: не пише жоден новий агент (це вимоги до реалізації,
    див. §9 П6).
  - Тестові файли: test-writer (і implementer, коли крок плану потребує
    тесту).
  - Документація (`<pkg>/docs/**`, README): doc-writer. Посилання "Read
    when" у пакетних `AGENTS.md` doc-writer лише пропонує, але не пише
    (змінено 2026-09-24, див. Р5).
- **Іменування:** імена файлів у kebab-case, як у наявних агентів і хуків.

## 7. Кроки

**Крок 0: ініціація.** Прочитати кореневий `INSIGHTS.md`,
`.claude/agents/README.md`, обидва наявні guard-хуки й увесь цей план.
*Скіл: engineering-insights.*

**Крок 1: `.claude/hooks/readonly-bash-guard.sh` (новий).** *Скіл: security.*
- Використання: `readonly-bash-guard.sh <git|verify>`. Режим передається
  аргументом у команді у frontmatter агента.
- Розпарсити `tool_name` і `tool_input.command` через `python3`. Якщо парсинг
  не вдався, режим невідомий або `tool_name != Bash`, вийти з кодом 2.
- Відхиляти (exit 2) будь-яку команду, що містить перенос рядка, `;`, `&`,
  `|`, `>`, `<`, зворотну лапку, `$(` чи `${`. Так кожен виклик лишається
  однією командою, без перенаправлень і підстановок.
- Режим `git`: дозволено лише
  `^git( -C [^ ]+)? (diff|status|log|show|merge-base|rev-parse|ls-files|blame)( [^ ].*)?$`,
  а будь-який аргумент `--output`, `--ext-diff` чи `-o ` відхиляється (вони
  пишуть файли або запускають програми).
- Режим `verify`: усе, що дозволяє режим `git`, плюс рівно:
  - `^(npx --yes pnpm@10|pnpm) -C (server|client|e2e) (typecheck|test|lint)$`
  - `^(npx --yes pnpm@10|pnpm) -C (server|client) exec vitest run [A-Za-z0-9_./\[\]@-]+( --exclude [^ ]+)?$`
  - `^npm --prefix reviewer-core (test|run typecheck)$`
- Повідомлення про блокування: `readonly-bash-guard(<mode>): '<cmd>' is not on the read-only allowlist. …`.
- Коментар-заголовок пояснює обидва режими й те, який агент використовує
  кожен.

**Крок 2: `.claude/hooks/test-writer-guard.sh` (новий).** *Скіл: security.*
Взяти за основу `implementer-guard.sh` і змінити таке:
- Fail closed при помилці парсингу (exit 2).
- **Edit|Write:** дозволено лише тоді, коли `file_path` лежить під
  `$CLAUDE_PROJECT_DIR` і відповідає одному з шаблонів:
  - `/(client|server|reviewer-core)/.*\.test\.tsx?$` (покриває й `.it.test.ts`)
  - `/client/src/test/[^/]+\.(ts|tsx)$` (спільні хелпери клієнтських тестів)
  - `/server/test/helpers/[^/]+\.ts$`
  - `/(client|server|reviewer-core|e2e)/INSIGHTS\.md$` або `^<root>/INSIGHTS\.md$`

  Навіть коли один із них збігається, регулярний вираз `protected` з
  implementer (vendor/migrations/lockfile) усе одно блокує.
- **Bash:** залишити блокування implementer (`git commit|push`, `db:migrate`,
  запис shell-командами в захищені шляхи). Також блокувати зміну
  залежностей, бо вона зачіпає lockfile:
  `(pnpm|npm|yarn)( [^ ]+)* (add|install|i|remove|rm|uninstall|update|up)( |$)`
  і `npx --yes pnpm@[^ ]+ (add|install|…)`. Блокувати `sed -i`, `tee` і
  `>`/`>>`, якщо ціль — не тестовий шлях і не scratchpad сесії. Якщо шаблон
  виходить надто складним, блокувати `sed -i`/`tee`/перенаправлення повністю й
  казати агенту використовувати Edit/Write (див. §9 Р3).

**Крок 3: `.claude/hooks/doc-writer-guard.sh` (новий).** *Скіл: security.*
- Fail closed. Лише `Edit|Write`. Дозволено лише `.md`-шляхи під
  `$CLAUDE_PROJECT_DIR`, що відповідають:
  - `^<root>/(server|client|reviewer-core|e2e)/docs/[a-z0-9][a-z0-9-]*\.md$`
  - `^<root>/(server|client|reviewer-core|e2e)/README\.md$`
  - `^<root>/server/src/modules/[a-z0-9-]+/README\.md$`
  - `^<root>/README\.md$`
  - `^<root>/docs/(?!plans/)[a-z0-9-]+/[a-z0-9][a-z0-9-]*\.md$` (lookahead
    записати як дві окремі перевірки grep, бо `grep -E` не підтримує
    lookahead)
- Завжди блокувати: `docs/plans/`, будь-який `INSIGHTS.md`, `CLAUDE.md`,
  кожен `AGENTS.md` (кореневий і пакетні; змінено 2026-09-24, `CLAUDE.md` —
  симлінк на нього), `*/specs/**`, `.claude/**` і регулярний вираз
  protected.

**Крок 4: зробити хуки виконуваними.** `chmod +x` для трьох нових скриптів
(Bash implementer, окремий виклик на кожен файл).

**Крок 5: `.claude/agents/test-writer.md` (новий).**
*Скіли, що регулюють вміст: react-testing-library, onion-architecture,
fastify-best-practices.*

Frontmatter:
```yaml
---
name: test-writer
description: "Use after the implementer finishes, or when asked to add or extend tests, for client/ UI components and hooks and for server/ and reviewer-core/ routes, services, repositories and engine code. Picks the right test kind (RTL component test, hermetic unit test, Fastify inject route test, Testcontainers *.it.test.ts), applies the matching project skills, runs the targeted tests, and reports which regression each test catches. Writes only test files and test helpers; never changes production code, dependencies or lockfiles."
model: sonnet
effort: medium
maxTurns: 50
tools: Read, Grep, Glob, Edit, Write, Bash, Skill
disallowedTools: Agent, NotebookEdit
skills:
  - engineering-insights
  - react-testing-library
  - onion-architecture
hooks:
  PreToolUse:
    - matcher: "Bash|Edit|Write"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/test-writer-guard.sh"
---
```
Завантажуються на вимогу через `Skill`: `fastify-best-practices` (потім
прочитати `rules/testing.md`), `drizzle-orm-patterns` (`.it`-тести
репозиторіїв), `zod` (тести контрактів), `react-best-practices`,
`next-best-practices` (лише коли тест зачіпає RSC або файли маршрутів).

Структура системного промпту (розділи тіла):
1. **Роль**: один абзац. Ти лише пишеш тести й ніколи не редагуєш
   продакшн-код. Якщо тест виявив баг у продакшн-коді, залиш тест, не роби
   йому `.skip` і повідом про баг.
2. **Вхідні дані**: ціль (файл/компонент/модуль) або Development Plan
   (розділи 3, 7, 8) та/або Implementation Report («Done», «Handoff to
   review»). Якщо цілі немає, постав нумерований список запитань і зупинись.
3. **Старт**: прочитати `AGENTS.md` + `INSIGHTS.md` цільового пакета й
   `TESTING.md`. Викликати через `Skill` кожен скіл на вимогу, чия область
   тестується.
4. **Вибір виду тесту** (таблиця):

   | Ціль | Вид | Розташування / назва |
   |---|---|---|
   | клієнтський компонент у `_components/<Name>/` | RTL + jsdom flow-тест | `<Name>/<Name>.test.tsx` (поруч) |
   | чистий клієнтський хелпер (`helpers.ts`, `src/lib/*.ts`) | unit | поруч `<file>.test.ts` або в тесті компонента, якщо в хелпера один споживач |
   | серверний сервіс / доменна логіка | unit з in-memory фейковими портами | `server/test/<module>-<topic>.test.ts` |
   | серверний маршрут без БД | `buildApp({config, overrides})` + `app.inject` + `app.close()` | `server/test/<name>.test.ts` |
   | серверний репозиторій / маршрут з БД | Testcontainers: `dockerAvailable()`, `startPg()`, `seed()`, запасний `describe.skip` | `server/test/<name>.it.test.ts` |
   | рушій reviewer-core | unit із заглушкою `LLMProvider` | `reviewer-core/test/<name>.test.ts` |

   Промпт також каже, що серверні тести лежать у `server/test/`, а не поруч
   із кодом (так прийнято в репозиторії, хоча CLAUDE.md каже «co-located»).
5. **Винятки репозиторію із загальних скілів** (цитата з `client/INSIGHTS.md`
   2026-09-20):
   - `import userEvent from "@/test/user"`, шим на fireEvent. У нього немає
     `hover`/`keyboard`/`setup()`, тож методи викликаються напряму.
   - `renderWithIntl` з `@/test/render-intl` для компонентів з next-intl.
   - фікстури з `@/test/fixtures`; `afterEach(cleanup)`.
   - Без MSW. Мокати на рівні хука чи API-модуля
     (`vi.mock("@/lib/hooks/…")`) або передавати props. Ніколи не мокати
     компонент, що тестується.
   - Скрізь vitest (ніколи `jest` чи `node:test`).
   - Зовнішні залежності сервера беруться з `src/adapters/mocks.ts`. Без
     мережі, без ключів.
   - Ніколи не додавати залежностей. Якщо бракує можливості (наприклад,
     hover), указати це в «Not covered».
6. **Правила RTL, що зберігаються** (зі скіла): пріоритет запитів, `screen`,
   `findBy`/`waitFor` (без фіксованих затримок), 1–3 flow-тести на компонент,
   перевірка поведінки, а не реалізації, без snapshot-ів.
7. **Планка покриття** (TESTING.md): один щасливий шлях плюс той край, що має
   значення. Перед кожним тестом назвати регресію, яку він ловить. Тести, що
   нічого не ловлять, не писати.
8. **Запуск**: спершу цільовий файл (`npx --yes pnpm@10 -C client exec vitest
   run <path>` / те саме з `-C server`), потім `test` + `typecheck` пакета.
   `.it`-тести пропускаються без Docker. Про це звітувати як «skipped (no
   Docker)» і ніколи — як про успішний прогін.
9. **Запис інсайтів** (фільтр engineering-insights).
10. **Запобіжники**: шляхи, які обмежує хук (перелік), без commit/push, без
    `db:migrate`, без встановлення пакетів. Не послаблювати наявні асерти,
    щоб набір тестів позеленів.

Формат виходу:
```
# Test Report
## Targets
What was asked / derived from plan or report.
## Tests written
file → test name → scenario → regression it catches (new / extended).
## Skills applied
Preloaded / invoked (with reason).
## Checks run
command → result (real output for failures; `.it` skipped = "skipped: no Docker").
## Failing: suspected production defects
test → failure output → suspected cause (file:line). "none" if none.
## Not covered
Behaviour left untested and why (missing tool/dependency, out of scope).
## INSIGHTS.md
Entries written or "none".
```

**Крок 6: `.claude/agents/architecture-reviewer.md` (новий).**
*Скіли, що регулюють вміст: onion-architecture,
react-frontend-architecture.*

Frontmatter:
```yaml
---
name: architecture-reviewer
description: "Use proactively after the implementer or test-writer finishes, or before opening a PR, to check architectural boundaries of the changed code: server onion layering (routes → service → repository, ports, no infra imports in service/ports/domain, repositories return mapped types), module isolation, client feature boundaries and the server/client ('use client') split, reviewer-core purity, and do-not-touch paths. Read-only: returns findings with file:line evidence and quoted code, plus a 'cannot verify' list; never edits files."
model: opus
effort: high
maxTurns: 30
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, NotebookEdit, Agent
skills:
  - onion-architecture
  - react-frontend-architecture
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/readonly-bash-guard.sh git"
---
```
Файли інших скілів за потреби агент читає напряму через `Read`:
`.claude/skills/next-best-practices/rsc-boundaries.md`,
`.claude/skills/pr-self-review/severity.md`.

Структура системного промпту:
1. **Роль і обсяг**: лише архітектура. Не безпека, не стиль, не якість тестів
   і не відповідність плану (безпекове рев'ю роблять окремо, відповідність
   плану перевіряє plan-verifier). Рекомендаційний характер:
   `pr-self-review` лишається ворітьми злиття.
2. **Вхідні дані**: список змінених файлів з «Handoff to review»
   Implementation Report або з `git status --porcelain` +
   `git diff --name-only <base>` (включно з робочим деревом, бо implementer
   не комітить). Необов'язково: розділ 6 плану (Architecture constraints).
3. **Прохід 1, детермінований (Grep по робочому дереву)**: відтворити правила
   розділу 4 `checks.sh` з тими самими ідентифікаторами правил, плюс додаткові
   структурні правила:
   - `det/layer-route-repo`: `routes.ts` імпортує `./repository`.
   - `det/layer-service-infra`: `service.ts`/`ports.ts`/`domain/**` імпортує
     `fastify|drizzle-orm|postgres|octokit|@octokit/*|openai|@anthropic-ai/sdk`.
   - `det/client-imports-server`: `client/**` імпортує `server/` чи `@devdigest/api`.
   - `onion/service-new-infra`: `new \w+(Repository|Client|Provider)\(` або
     імпорт `Container` у `service.ts`.
   - `onion/raw-rows`: `$inferSelect` у публічному типі повернення
     репозиторію.
   - `onion/cross-module`: `modules/<a>/**` імпортує `modules/<b>/(repository|helpers|constants)`.
   - `frontend/cross-feature`: `client/src/app/<a>/**` імпортує
     `client/src/app/<b>/_components`.
   - `frontend/fetch-in-component`: `fetch(` у `_components/**`.
   - `frontend/server-client-boundary`: `'use client'` у `page.tsx`/`layout.tsx`.
   - `rc/impure`: `reviewer-core/src/**` імпортує `fs`, `node:fs`,
     `child_process`, `postgres`, `drizzle-orm`, `octokit` або конкретний
     LLM SDK поза `src/llm/`.
   - `det/do-not-touch`: змінені шляхи зі списку protected.
4. **Прохід 2, рівень намірів (судження LLM)**: лише на змінених ханках.
   Застосувати onion "Review checklist" 1–10 і react-frontend-architecture
   "Review checklist" 1–7. Не переписувати незачеплені модулі (вступ
   onion-скіла).
5. **Правило доказів** (проти хибних спрацювань): кожна знахідка має
   `file:line`, дослівно процитовані рядки, ідентифікатор правила й розділ
   скіла, через який це порушення. Перед тим як звітувати, повторно відкрити
   файл на цьому рядку й підтвердити. Якщо підтвердити не вдалося, перенести
   знахідку в «Cannot verify». Жодних загальних порад.
6. **Серйозність**: словник і ідентифікатори `pr-self-review/severity.md`
   (critical/major/minor). Порушення, що вже були в незмінених рядках, іти
   в «Pre-existing», а не в «Findings».
7. **Вердикт** (рекомендаційний): `CLEAN` (знахідок немає) / `CONCERNS`
   (лише major/minor) / `VIOLATIONS` (≥1 critical).
8. **Запобіжники**: лише читання. Bash тільки через git-allowlist.
   Запропонований напрям виправлення — одне речення, ніколи не патч.

Формат виходу:
```
# Architecture Review
## Scope
Base, files reviewed, files skipped (vendored/generated/docs) and why.
## Verdict
CLEAN | CONCERNS | VIOLATIONS (advisory; pr-self-review is the gate).
## Findings
| # | severity | rule id | file:line | evidence (quoted) | rule source (skill §) | direction |
## Pre-existing (not introduced by this change)
Same columns.
## Cannot verify
Suspected issue → what evidence is missing.
## Checks run
Pass 1 patterns (with hit counts) and git commands.
```

**Крок 7: `.claude/agents/plan-verifier.md` (новий).** *Скілів коду немає.
Вміст промпту слідує формату виходу planner (`planner.md:74-99`).*

Frontmatter:
```yaml
---
name: plan-verifier
description: "Use after implementation (and tests) to verify the finished code against EVERY item of a Development Plan in docs/plans/<feature>_en.md and the linked specs/requirements: first extracts a numbered requirement checklist, then audits each item as PASS / FAIL / PARTIAL / NOT VERIFIABLE / BLOCKED with file:line or command-output evidence. Never replaces plan items with generic best-practice advice. Read-only except for running the plan's own acceptance commands."
model: opus
effort: high
maxTurns: 40
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit, NotebookEdit, Agent
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/readonly-bash-guard.sh verify"
---
```
Попередньо завантажених скілів немає: чеклист береться з плану, а не зі
скілів. Це навмисно, щоб агент не сповзав у загальні поради.

Структура системного промпту:
1. **Роль**: аудитор трасованості. План і вимоги — єдина мірка.
2. **Вхідні дані**: шлях до плану (обов'язковий; якщо його немає або він не
   у форматі planner, зупинитися й сказати, чого бракує). Необов'язково:
   шляхи до специфікацій, названі в плані (`<pkg>/specs/<feature>.md`),
   Implementation Report, Test Report і додаткові вимоги користувача,
   процитовані в задачі.
3. **Фаза 1, витягнути (код ще не читається)**: перетворити кожен атомарний
   пункт на рядок зі стабільним id:
   - `P3.n`: кожен змінений файл/зміна (розділ 3)
   - `P4.n`: кожен контракт (розділ 4)
   - `P6.n`: кожне обмеження (розділ 6)
   - `P7.n`: кожен крок, розбитий по файлах, якщо крок називає кілька
   - `P8.n`: кожна команда/перевірка приймання (розділ 8)
   - `P1.NG.n`: кожен пункт «поза обсягом» (перевіряється, що це *не* зроблено)
   - `S.<spec>.n`: кожна вимога / критерій приймання зі специфікації
   - `U.n`: кожна вимога користувача

   Вивести кількість пунктів за кожним джерелом. Нічого не можна об'єднувати
   чи пропускати. Якщо пункт джерела неоднозначний, залишити його й позначити
   `NOT VERIFIABLE (ambiguous)`.
4. **Фаза 2, аудит**: для кожного id знайти доказ (file:line + цитата, ханк
   `git diff` або вивід команди). Дозволені вердикти: `PASS`, `FAIL`,
   `PARTIAL` (сказати, чого бракує), `NOT VERIFIABLE` (сказати чому,
   наприклад браузерна перевірка без інструменту чи `.it`-тести пропущені
   без Docker), `BLOCKED` (план подає це як відкрите питання). Відхилення,
   визнане в Implementation Report, усе одно отримує FAIL/PARTIAL з позначкою
   «acknowledged».
5. **Команди**: запускати команди розділу 8 через allowlist
   (`npx --yes pnpm@10 -C <pkg> …`, за кореневим INSIGHTS). Команда, яку
   allowlist відхилив, стає `NOT VERIFIABLE (not allowlisted)`. Ніколи не
   довіряти «Checks run» з чужого звіту без повторного запуску чи позначки
   «не перевірено».
6. **Розповзання обсягу**: кожен змінений файл (`git status --porcelain`,
   `git diff --name-only <base>`), до якого не веде жоден id, іде в
   «Unplanned changes».
7. **Заборонено**: загальні поради, коментарі щодо стилю, думки про
   архітектуру чи безпеку, пропозиції, не прив'язані до id.
8. **Загалом**: `COMPLETE` лише коли кожен пункт PASS або NOT VERIFIABLE з
   причиною, яку користувач може прийняти. Інакше `INCOMPLETE`.

Формат виходу:
```
# Plan Verification: <feature>
## Sources
Plan path, spec paths, reports used, base commit, working-tree state.
## Requirement checklist (N items: P=…, S=…, U=…)
| ID | Source (file §) | Requirement (quoted or condensed) | Verdict | Evidence |
## Failures and partials
Per id: expected, found, where it should be.
## Commands run
command → exit/result (real output for failures).
## Unplanned changes
file → why it is not traced to any id.
## Not verifiable
id → reason → what would verify it.
## Summary
Counts per verdict; overall COMPLETE | INCOMPLETE.
```

**Крок 8: `.claude/agents/doc-writer.md` (новий).** *Скіл, що регулює вміст:
mermaid-diagram.*

Frontmatter:
```yaml
---
name: doc-writer
description: "Use after a feature is implemented and verified (plan-verifier COMPLETE), or when asked to document existing behaviour: turns a Development Plan, spec, implementation/verification report or the code itself into documentation in the right place (package docs/<topic>.md, package or module README sections, root README architecture), with Mermaid diagrams where they clarify. Proposes package AGENTS.md 'Read when' links in its report (it cannot edit AGENTS.md). Verifies claims against the code. Writes only documentation markdown; never code, plans, specs, INSIGHTS.md, AGENTS.md or CLAUDE.md."
model: sonnet
effort: medium
maxTurns: 30
tools: Read, Grep, Glob, Edit, Write
disallowedTools: Bash, NotebookEdit, Agent
skills:
  - mermaid-diagram
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/doc-writer-guard.sh"
---
```

Структура системного промпту:
1. **Роль**: документувати те, що вийшло, а не те, що планувалося. Код —
   джерело правди. Якщо план/специфікація й код розходяться, документувати
   код і повідомити про розбіжність.
2. **Вхідні дані**: назва фічі плюс будь-що з переліку: шлях до плану, шляхи
   до специфікацій, звіти, шляхи модулів. Спершу прочитати `AGENTS.md`,
   `README.md`, `docs/README.md` пакета й наявні документи, щоб нічого не
   дублювати.
3. **Куди писати** (таблиця розміщення; вона ж потрапляє у звіт):

   | Вміст | Куди | Правило |
   |---|---|---|
   | Глибока архітектурна нотатка / рішення для одного пакета (пояснення) | `<pkg>/docs/<topic>.md`, kebab-case, одна тема на файл | потім запропонувати в звіті посилання "Read when" для `<pkg>/AGENTS.md` (doc-writer не може його редагувати) |
   | Зміни мапи пакета (мапа маршрутів, мапа API, конвеєр, тестування) | наявний розділ `<pkg>/README.md` | розширити його, не заводити паралельну сторінку |
   | Внутрішня будова одного серверного модуля | `server/src/modules/<name>/README.md` | прецедент: `repo-intel/README.md` |
   | Потік між пакетами | кореневий `README.md#architecture` | оновити наявну mermaid-діаграму, ніколи не додавати другу |
   | Промпти агентів-рев'юерів | `docs/agent-prompts/` | лише на запит; за "Checklist before shipping a prompt" |
   | Плани / специфікації / INSIGHTS | не пише | їх ведуть planner / люди / engineering-insights |

4. **Тип документа** (Diátaxis): для кожної сторінки оголосити один тип
   (tutorial, how-to, reference, explanation) і не змішувати їх. Сторінки
   пакетних `docs/` переважно *explanation* або *reference*.
5. **Діаграми** (скіл mermaid-diagram): тип обирати за Decision Guide
   (sequence для API-потоків, flowchart для конвеєрів, ER для таблиць, state
   для життєвих циклів). ≤20 вузлів, підписані ребра, блок
   ```` ```mermaid ````. Ідентифікатори вузлів і ребра мають називати
   справжні модулі/файли. Bash немає, тож синтаксис звіряти з таблицями
   скіла до запису, а кожну діаграму вносити у звіт, щоб людина перевірила
   рендер.
6. **Докази**: кожне твердження про поведінку посилається на шлях у
   репозиторії (`path/to/file.ts`), за потреби з номером рядка. Нічого не
   копіюється з плану без звірки з кодом.
7. **Стиль**: англійською, як наявні документи. Перенос рядків близько 80
   символів, як у наявному markdown. Без нових візуальних матеріалів.
8. **Перенесення з INSIGHTS**: стабільні записи INSIGHTS, яким місце в новому
   документі, вносити в «Suggested INSIGHTS promotions». INSIGHTS.md не
   редагувати.
9. **Запобіжники**: allowlist шляхів, який обмежує хук (перелік). Без Bash.

Формат виходу:
```
# Documentation Report
## Sources used
Plan/spec/report/code paths actually read.
## Files written
path → new/modified → Diátaxis type → sections touched.
## Diagrams
path → mermaid type → what it shows → nodes count.
## Proposed AGENTS.md links
## Discrepancies (plan/spec vs code)
item → plan says → code does (file:line).
## Not documented
What and why.
## Suggested INSIGHTS promotions
entry (file + date) → target doc.
```

**Крок 9: `.claude/agents/README.md` (змінюється).** *Скіл: mermaid-diagram
(лише якщо блок workflow перетворюється; за замовчуванням зберігаємо
наявний ASCII-стиль).*
- Таблиця огляду: додати 4 рядки (model / effort / maxTurns, tools, denied)
  у наявному форматі колонок.
- Блок workflow: замінити на конвеєр з §1 і зберегти
  «researcher ── standalone».
- Речення "Architecture and security review are **not** done by these agents"
  замінити таким змістом: архітектурне рев'ю робить `architecture-reviewer`
  (рекомендаційно; ворітьми лишається `pr-self-review`), безпекове рев'ю
  й далі робиться поза цими агентами.
- Картка для кожного нового агента: Inputs, Output, Preloaded skills,
  Permissions (назва хука + що він блокує).
- "Sources behind the rules": таблиця для кожного нового агента. Джерела з
  репозиторію (CLAUDE.md, TESTING.md, записи INSIGHTS, скіли, severity.md)
  плюс **зовнішні джерела** (URL з §9 «Зовнішні джерела»). Цитати з пошукових
  підсумків позначати «summary, to be verified».
- Розділ "Adding an agent" лишається без змін.

**Крок 10: самотести хуків (вручну, без створення файлів).** Виконати
команди хуків з §8 і вставити коди виходу у звіт реалізації.

**Крок 11: пробні запуски** (запускає користувач, на тимчасовій гілці; див. §8).

**Крок 12: запис інсайтів.** Кореневий `INSIGHTS.md`, лише якщо трапилося
щось неочевидне. Відомий кандидат: «`implementer-guard.sh` пропускає виклик
при помилці парсингу (fail open); нові guard-и блокують (fail closed)».
Розділ Codebase Patterns, спершу перевірка на дублікати.
*Скіл: engineering-insights.*

## 8. Перевірки приймання

Код пакетів не змінюється, тож `pnpm typecheck` / `pnpm test` для цієї задачі
**не обов'язкові**. Запускати їх лише тоді, коли пробний запуск змінює файли
пакета (пробний запуск test-writer): `npx --yes pnpm@10 -C client test` і
`npx --yes pnpm@10 -C client typecheck`.

Статичні перевірки (корінь репозиторію):
- `ls .claude/agents/` показує `architecture-reviewer.md doc-writer.md
  implementer.md plan-verifier.md planner.md researcher.md test-writer.md`
  плюс `README.md`.
- Frontmatter парситься:
  `python3 -c 'import sys,re,yaml; [yaml.safe_load(re.match(r"^---\n(.*?)\n---", open(f).read(), re.S).group(1)) for f in sys.argv[1:]]' .claude/agents/*.md`
  завершується з кодом 0. Якщо PyYAML немає, перевірити в `/agents`, що всі
  чотири агенти завантажуються без помилок.
- `test -x .claude/hooks/readonly-bash-guard.sh && test -x .claude/hooks/test-writer-guard.sh && test -x .claude/hooks/doc-writer-guard.sh`

Тести хуків (очікуваний код виходу в дужках; `R=/Users/mtakumi/Projects/dev-digest`,
запуск з `CLAUDE_PROJECT_DIR=$R`):
- readonly `git`: `{"tool_name":"Bash","tool_input":{"command":"git diff --name-only main"}}` [0];
  `git diff --output=/tmp/x` [2]; `git status; rm -rf x` [2];
  `git log | head` [2]; `pnpm -C client test` [2]; зламаний JSON `{` [2].
- readonly `verify`: `npx --yes pnpm@10 -C client test` [0];
  `npm --prefix reviewer-core test` [0];
  `npx --yes pnpm@10 -C client add msw` [2]; `cd client && pnpm test` [2].
- test-writer: Write `$R/client/src/app/skills/_components/SkillsList/SkillsList.test.tsx` [0];
  Write `$R/client/src/app/skills/_components/SkillsList/SkillsList.tsx` [2];
  Write `$R/server/test/foo.it.test.ts` [0];
  Write `$R/client/src/vendor/ui/x.test.tsx` [2];
  Bash `git commit -m x` [2]; Bash `npx --yes pnpm@10 -C client add msw` [2];
  Bash `echo x > $R/server/src/app.ts` [2]; зламаний JSON [2].
- doc-writer: Write `$R/server/docs/grounding-gate.md` [0];
  Write `$R/server/AGENTS.md` [2]; Write `$R/docs/plans/x_en.md` [2];
  Write `$R/server/INSIGHTS.md` [2]; Write `$R/server/specs/x.md` [2];
  Write `$R/server/src/app.ts` [2]; Write `$R/CLAUDE.md` [2]; зламаний JSON [2].

Поведінкові пробні запуски (запускає користувач на тимчасовій гілці; кожен —
окрема перевірка):
- **test-writer**: «Додай тест для порожнього стану
  `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner`.»
  Очікується Test Report за шаблоном, `git status --porcelain` показує лише
  зміни `*.test.tsx`, `import userEvent from "@/test/user"` (якщо потрібна
  взаємодія) і запити `getByRole`/`getByText`.
- **architecture-reviewer**: на тимчасовій гілці додати
  `import { SkillsRepository } from './repository'` у
  `server/src/modules/skills/routes.ts` (без коміту). Очікується одна
  critical-знахідка `det/layer-route-repo` з точним `file:line` і процитованим
  імпортом, агент не змінює файлів, розділ «Cannot verify» присутній (хай
  навіть «none»).
- **plan-verifier**: запустити на самому `docs/plans/quality-subagents_en.md`
  після реалізації цього плану. Очікується чеклист, у якому кількість рядків
  дорівнює кількості витягнутих пунктів §3/§4/§6/§7/§8/«поза обсягом», кожен
  рядок має вердикт і доказ, а «Unplanned changes» не містить нічого
  несподіваного.
- **doc-writer**: «Задокументуй guard-хуки агентів» (або невелику справжню
  фічу). Очікується запис лише в дозволені шляхи, mermaid-блок ≤20 вузлів,
  який рендериться в preview GitHub чи на mermaid.live, і заповнений розділ
  «Discrepancies» (або «none»).
- `.claude/agents/README.md` рендериться, у таблиці огляду 7 рядків, і всі
  посилання працюють.

## 9. Ризики й відкриті питання

**Відкриті питання до користувача.** Кроки, які вони блокують, указано.
Значення за замовчуванням у дужках; план використовує їх, якщо не сказано
інакше.
1. **Моделі.** [test-writer `sonnet`/medium, doc-writer `sonnet`/medium,
   architecture-reviewer `opus`/high, plan-verifier `opus`/high.] Рев'юер і
   верифікатор виконують роботу, де багато суджень і важлива точність.
   Перевести їх на sonnet заради вартості? (Кроки 6–7, лише frontmatter.)
2. **Bash для агентів лише для читання.** [Bash з allowlist
   `readonly-bash-guard.sh`.] Альтернатива — зовсім без Bash
   (`tools: Read, Grep, Glob`). Тоді architecture-reviewer має отримувати
   список змінених файлів ззовні, а plan-verifier не зможе повторно
   запускати команди приймання, і вони стануть NOT VERIFIABLE. (Блокує
   кроки 1, 6, 7, якщо відповідь — «без Bash».)
3. **plan-verifier запускає тести.** [Дозволено: лише typecheck/test/lint.]
   Тести мають побічні ефекти (Testcontainers, `.next`, кеші). Прийнятно?
4. **Браузерні перевірки** в plan-verifier. [NOT VERIFIABLE, якщо
   користувач не надав скриншот.] Дати йому інструмент Playwright MCP?
5. **Детермінований інструментарій архітектури.** Додати набір правил
   `.dependency-cruiser.cjs` (dependency-cruiser уже є залежністю сервера)
   окремою наступною задачею, щоб Прохід 1 рев'юера став справжнім запуском
   інструмента? [Зараз поза обсягом.]
6. **doc-writer і `specs/`.** Чи має він колись оновлювати `<pkg>/specs/`
   після реалізації (наприклад, позначати «implemented»)? [Ні.]
7. **e2e-флоу.** Чи має test-writer також писати e2e-флоу у JSON? [Ні.]
   Примітка: `e2e/AGENTS.md` каже, що флоу лежать у `specs_old/`, але
   `e2e/specs/` також містить ті самі файли `*.flow.json`. Це треба з'ясувати
   до будь-якої роботи агента з e2e.
8. **Розташування серверних тестів.** CLAUDE.md каже «co-located», але всі
   серверні тести лежать у `server/test/`. [test-writer слідує
   `server/test/`.] Підтвердити або виправити формулювання CLAUDE.md (не в
   цьому плані).
9. **Мова документації.** Лише англійська чи ще й `_uk`, як для планів?
   [Лише англійська.]
10. **Куди йдуть звіти plan-verifier.** Лише у відповідь (як у рев'юерів) чи
    зберігаються в `docs/plans/<feature>_verification.md`? [Лише у відповідь;
    для збереження потрібен write-guard, як у planner.]
11. **Кореневий `docs/` для документації між пакетами.** Зараз кореневий
    `docs/` має лише `agent-prompts/` і `plans/`. Чи може doc-writer створити
    новий розділ `docs/<topic>/` у корені? [Регулярний вираз guard-а це
    дозволяє, але *новий* розділ потребує згоди користувача.]

**Ризики.**
- **Р1: хибні спрацювання в архітектурному рев'ю.** Виявлення смелів і
  архітектурних проблем LLM дає високий рівень хибних спрацювань (SmellBench
  повідомляє 63.1%; це з пошукового підсумку, потребує перевірки).
  Пом'якшення: детермінований Прохід 1, обов'язкові процитовані докази з
  повторним читанням, кошик «Cannot verify», рекомендаційний вердикт.
- **Р2: обхід allowlist.** Парсинг shell регулярними виразами крихкий.
  Захист — відхилення метасимволів плюс якірні шаблони. Рев'юер безпеки має
  спробувати: `git -c core.pager=… log`, `git diff --ext-diff`,
  `git -c alias.x='!sh' x`, `GIT_EXTERNAL_DIFF`, префікси змінних оточення
  (`FOO=1 git …`), `pnpm -C client test -- --reporter=…`, шляхи з пробілами.
  Варто також відхиляти `-c` у режимі git.
- **Р3: запис через shell у test-writer.** Виявляти цілі `sed -i`/`tee`/
  перенаправлень регулярними виразами можна лише приблизно. Найпростіше
  безпечне правило — блокувати їх повністю (агент має Edit/Write).
- **Р4: вартість попереднього завантаження `skills`.** Попереднє
  завантаження вставляє повний SKILL.md. Списки попереднього завантаження
  мінімальні, решта завантажується на вимогу.
- **Р5: AGENTS.md і CLAUDE.md — симлінки** (підтверджено 2026-09-24:
  `CLAUDE.md -> AGENTS.md` у корені й у кожному пакеті). Дозвіл doc-writer
  редагувати `<pkg>/AGENTS.md` означав би й редагування `<pkg>/CLAUDE.md`,
  тобто інструкцій для агентів. **Вирішено 2026-09-24 (схвалено
  користувачем):** doc-writer не торкається жодного AGENTS.md чи CLAUDE.md,
  лише *пропонує* посилання "Read when" у звіті, а guard блокує обидві назви
  скрізь.
- **Р6: обсяг implementer.** `implementer.md` описує свій обсяг як
  "client/ and server/", а цей план зачіпає лише `.claude/`. Guard
  implementer не блокує `.claude/`, але користувач може віддати перевагу
  застосувати план напряму.
- **Р7: маршрутизація pr-self-review.** `.claude/**` має статус "Not reviewed
  by skills", тож нові хуки не проходять автоматичного рев'ю. Їм потрібне
  ручне безпекове рев'ю.

**Для рев'юерів архітектури / безпеки.** Р2, Р3, Р5, поведінка fail-closed
усіх трьох хуків, а також чи справді `disallowedTools` разом із хуками не
лишає architecture-reviewer і plan-verifier жодного шляху до запису.

**Зовнішні джерела** (дата доступу 2026-09-24; частина тверджень узята з
пошукових підсумків, тож цитати треба перевірити, перш ніж посилатися на них
у README):
- Субагенти Claude Code: https://code.claude.com/docs/en/sub-agents
  (поля frontmatter; обов'язкові лише `name` + `description`; allowlist
  `tools` проти `disallowedTools`; якщо `tools` не вказано, успадковуються
  всі; `skills` вставляє повний вміст і не успадковується від батьківського
  агента; description каже, коли делегувати; субагент бачить лише власний
  промпт плюс відомості про середовище).
- Архітектурне рев'ю / смели з LLM, хибні спрацювання: https://arxiv.org/html/2605.07001
  (SmellBench, 63.1% FP, потребує перевірки), https://arxiv.org/pdf/2603.00822,
  https://www.augmentcode.com/guides/ai-vulnerability-detection
- Детерміновані архітектурні правила: https://github.com/LukasNiessen/ArchUnitTS,
  https://www.archunit.org/userguide/html/000_Index.html (і dependency-cruiser,
  що вже є в `server/package.json`).
- Трасованість плану/вимог і двокроковий шаблон «витягнути, потім
  перевірити»: https://arxiv.org/pdf/2605.17926, https://arxiv.org/pdf/2607.18886.
  Схема вердиктів у кроці 7 виведена, а не стандартна.
- Написання тестів: https://testing-library.com/docs/queries/about/#priority,
  https://kentcdodds.com/blog/common-mistakes-with-react-testing-library,
  https://fastify.dev/docs/latest/Guides/Testing/,
  https://node.testcontainers.org/modules/postgresql/. Таблиця unit проти
  integration у кроці 5 — синтез цих джерел і TESTING.md.
- Документація: https://diataxis.fr/,
  https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams

## 10. Не вдалося визначити

- **Чи `AGENTS.md` і `CLAUDE.md` — симлінки.** Вміст однаковий, але без Bash
  я не міг перевірити `ls -l`. Це важливо для Р5.
- **Точна семантика frontmatter субагентів.** Підсумок дослідження
  перелічує `permissionMode`, `memory`, `isolation`, `color`. Я не завантажував
  документацію сам, тож не перевірено, чи аргументи хука
  (`… guard.sh git`) передаються як є і чи `disallowedTools` переважає
  `tools`, коли обидва називають той самий інструмент. Наявні агенти
  використовують ті самі шаблони, тож вони, найімовірніше, працюють, але
  передавання аргументів — нове. Запасний варіант: два окремі скрипти
  (`readonly-git-guard.sh`, `verify-guard.sh`).
- **Авторитетні настанови Anthropic щодо дизайну промптів test-writer /
  doc-writer.** Не знайдено (за брифом дослідження). Ці промпти спираються на
  конвенції репозиторію й загальні джерела вище.
- **Поради щодо повторного використання Vitest / Testcontainers**
  (перевикористання контейнера між файлами, `singleFork`) не завантажувалися.
  test-writer слідує наявному шаблону «`startPg()` на файл».
- **Чи встановлено PyYAML** для перевірки frontmatter у §8. Запасний варіант
  через `/agents` наведено.
- **Чи працює на цій машині `npx --yes pnpm@10 -C <dir> exec vitest run <file>`**
  (`-C` разом з `exec`). Кореневий INSIGHTS підтверджує лише загальне
  `npx --yes pnpm@10 <cmd>`. Якщо не працює, plan-verifier позначає пункт
  NOT VERIFIABLE, а test-writer переходить на скрипт `test` пакета.
- **Чи файли `e2e/specs/*.flow.json` актуальні, чи це застарілі копії**
  (вони дублюють `specs_old/`). Для цього плану не потрібно, але важливо для П7.
