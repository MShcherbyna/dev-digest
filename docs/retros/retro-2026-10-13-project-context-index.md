# Retro: Project Context index (spec → plan → `/run-plan`, 2026-10-13)

Сесія `192a1a85-3002-4e53-9041-4bcb90211b12`, гілка `L05-homework-fix` (коміт `3e9f307`). Охоплено: правку промпта `implementation-planner` (AC-ID), аналіз дизайну, рішення про рівень B (маніфест + чанки), `spec-creator` → `implementation-planner` (2 раунди) → `/run-plan` (лінії S і C, test-writer, check-runner, bundle, огляд). Попередні ретро цієї фічі: [специфікація](retro-2026-10-11-project-context.md), [план](retro-2026-10-11-project-context-plan.md), [реалізація](retro-2026-10-11-project-context-run.md).

Підрахунок: сортування за `in + cache_write + out`, медіана субагентів = 124,155 (поріг викиду 248,310).

## Stats

(Вивід `session_stats.py --spec … --plan …` без змін. Спека й план прочитані з коміту `3e9f307`, бо робоче дерево тим часом переключено на `L06-lab`.)

# Session stats `192a1a85-3002-4e53-9041-4bcb90211b12`

| # | agent | description | model | start (UTC) | dur | turns | in | cache_w | cache_r | out | tool calls | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | main | (orchestrator) | sonnet-5-5 | 17:49:52 | 59086s | 90 | 210 | 177201 | 10654067 | 55149 | 69 | 2 |
| 1 | spec-creator | Spec for Project Context indexing | opus-5-5 | 09:05:07 | 1116s | 26 | 58 | 151817 | 2803056 | 6211 | 61 | 2 |
| 2 | implementation-planner | Plan Project Context indexing | opus-5-5 | 09:28:27 | 834s | 36 | 74 | 247245 | 5046793 | 30392 | 76 | 0 |
| 3 | implementer | Implement lane S (server) | sonnet-5-5 | 09:45:06 | 219s | 20 | 40 | 122350 | 1838472 | 420 | 24 | 0 |
| 4 | implementer | Implement lane C (client) | sonnet-5-5 | 09:45:06 | 90s | 9 | 18 | 85975 | 561403 | 543 | 13 | 2 |
| 5 | test-writer | Test-writer lane C (client) | sonnet-5-5 | 09:48:53 | 177s | 16 | 32 | 86374 | 1012192 | 226 | 23 | 1 |
| 6 | test-writer | Test-writer lane S (server) | sonnet-5-5 | 09:48:53 | 519s | 35 | 70 | 227380 | 5714364 | 1274 | 74 | 1 |
| 7 | check-runner | Run checks server and client | haiku-5-5 | 09:57:39 | 12s | 3 | 6 | 40279 | 42087 | 19 | 6 | 3 |
| 8 | architecture-reviewer | Architecture review of changes | sonnet-5-5 | 09:59:28 | 102s | 8 | 16 | 116726 | 493322 | 7413 | 29 | 6 |
| 9 | plan-verifier | Verify plan against code | sonnet-5-5 | 09:59:28 | 115s | 19 | 38 | 156049 | 1896749 | 4026 | 48 | 7 |

**Total** in=562 cache_write=1411396 cache_read=30062505 out=105673; agents spawned: 9

## Tool calls per agent
- main: Bash×40, Agent×9, Edit×5, AskUserQuestion×5, SendMessage×4, Write×4, Read×2
- spec-creator: Edit×29, Read×16, Grep×9, SubagentHandback×4, Write×2, Glob×1
- implementation-planner: Read×43, Grep×24, Glob×6, SubagentHandback×2, Write×1
- implementer: Bash×18, Read×4, Edit×1, SubagentHandback×1
- implementer: Bash×7, Read×5, SubagentHandback×1
- test-writer: Bash×11, Edit×6, Write×4, Read×1, SubagentHandback×1
- test-writer: Edit×29, Bash×26, Read×14, Write×4, SubagentHandback×1
- check-runner: Bash×3, Read×2, SubagentHandback×1
- architecture-reviewer: Read×18, Grep×5, Bash×3, Skill×2, SubagentHandback×1
- plan-verifier: Read×28, Bash×19, SubagentHandback×1

## Files read more than once inside one agent
- test-writer: `/Users/mtakumi/Projects/dev-digest/docs/plans/project-context-index_en.md` ×2
- check-runner: `/Users/mtakumi/Projects/dev-digest/docs/plans/project-context-index_en.md` ×2
- architecture-reviewer: `/Users/mtakumi/Projects/dev-digest/docs/plans/project-context-index_en.md` ×2
- plan-verifier: `/Users/mtakumi/Projects/dev-digest/docs/plans/project-context-index_en.md` ×2

## Files read by 2+ agents (duplicated discovery)
- `/Users/mtakumi/Projects/dev-digest/specs/2026-10-11-project-context.md`: spec-creator, implementation-planner
- `/Users/mtakumi/Projects/dev-digest/server/INSIGHTS.md`: spec-creator, implementation-planner, implementer, test-writer
- `/Users/mtakumi/Projects/dev-digest/server/AGENTS.md`: spec-creator, implementation-planner, implementer, test-writer
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/service.ts`: spec-creator, implementation-planner, test-writer, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/routes.ts`: spec-creator, implementation-planner, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/repo-intel/routes.ts`: spec-creator, implementation-planner
- `/Users/mtakumi/Projects/dev-digest/client/AGENTS.md`: spec-creator, implementation-planner, implementer
- `/Users/mtakumi/Projects/dev-digest/INSIGHTS.md`: spec-creator, implementation-planner
- `/Users/mtakumi/Projects/dev-digest/client/INSIGHTS.md`: spec-creator, implementation-planner, implementer, test-writer
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/repos/service.ts`: spec-creator, implementation-planner, architecture-reviewer
- `/Users/mtakumi/Projects/dev-digest/client/src/app/repos/[repoId]/context/_components/ProjectContextView/_components/FileListPanel/FileListPanel.tsx`: spec-creator, implementation-planner, plan-verifier
- `/private/tmp/claude-501/-Users-mtakumi-Projects-dev-digest/192a1a85-3002-4e53-9041-4bcb90211b12/images/41.png`: spec-creator, implementation-planner, implementer
- `/private/tmp/claude-501/-Users-mtakumi-Projects-dev-digest/192a1a85-3002-4e53-9041-4bcb90211b12/images/42.png`: spec-creator, implementation-planner, implementer
- `/Users/mtakumi/Projects/dev-digest/specs/2026-10-13-project-context-index.md`: spec-creator, implementation-planner, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/ports.ts`: implementation-planner, test-writer, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/schemas.ts`: implementation-planner, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/repository.ts`: implementation-planner, test-writer, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/constants.ts`: implementation-planner, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/platform/jobs.ts`: implementation-planner, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/platform/container.ts`: implementation-planner, architecture-reviewer
- `/Users/mtakumi/Projects/dev-digest/server/src/adapters/repo-docs/fs.ts`: implementation-planner, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/platform/resilience.ts`: implementation-planner, architecture-reviewer
- `/Users/mtakumi/Projects/dev-digest/server/src/db/schema/project-context.ts`: implementation-planner, implementer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx`: implementation-planner, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/client/src/lib/hooks/project-context.ts`: implementation-planner, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/test/project-context.it.test.ts`: implementation-planner, test-writer
- `/Users/mtakumi/Projects/dev-digest/docs/plans/project-context-index_en.md`: implementer, implementer, test-writer, check-runner, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/domain/chunking.ts`: test-writer, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/modules/project-context/indexer.ts`: test-writer, architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/client/src/app/repos/[repoId]/context/_components/ProjectContextView/use-reindex-flow.ts`: architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/client/src/app/repos/[repoId]/context/_components/ProjectContextView/_components/FileListPanel/_components/ReindexButton/ReindexButton.tsx`: architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/client/src/app/repos/[repoId]/context/_components/ProjectContextView/_components/FileListPanel/_components/IndexFooter/IndexFooter.tsx`: architecture-reviewer, plan-verifier
- `/Users/mtakumi/Projects/dev-digest/server/src/db/migrations/0017_curious_tana_nile.sql`: architecture-reviewer, plan-verifier

## Tool errors
- main / Read: <tool_use_error>This tool cannot read binary files. The file appears to be a binary .bin file. Use a skill for this file type if one is available, or a shell co
- main / AskUserQuestion: <tool_use_error>InputValidationError: AskUserQuestion failed due to the following issue: The required parameter `questions[2].options[1].description` is missing
- spec-creator / Edit: <tool_use_error>No changes to make: old_string and new_string are exactly the same.</tool_use_error>
- spec-creator / Edit: <tool_use_error>String to replace not found in file. String:   four icon buttons: plus (New file), folder (New folder), arrow-up (Upload) and   refresh (Re-inde
- implementer / Bash: Exit code 1 src/app/repos/[repoId]/context/page.tsx src/app/repos/[repoId]/context/_components/ProjectContextView/helpers.ts src/app/repos/[repoId]/context/_com
- implementer / Bash: Exit code 1 Traceback (most recent call last):   File "<stdin>", line 2, in <module> FileNotFoundError: [Errno 2] No such file or directory: '../../styles.ts'
- test-writer / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/test-writer-guard.sh]: test-writer-guard: shell redirection is blocked; use the Edit or Write t
- test-writer / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/test-writer-guard.sh]: test-writer-guard: shell redirection is blocked; use the Edit or Write t
- check-runner / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'npx --yes pnpm@10 -C /Users/mtaku
- check-runner / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'npx --yes pnpm@10 -C /Users/mtaku
- check-runner / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'pnpm -C /Users/mtakumi/Projects/d
- architecture-reviewer / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh git]: readonly-bash-guard(git): 'grep -n "" /Users/mtakumi/Projects/dev-
- architecture-reviewer / Grep: <tool_use_error>Error: No such tool available: Grep. Grep is not available in this session — search file contents with `grep` via the Bash tool instead.</tool_u
- architecture-reviewer / Grep: <tool_use_error>Error: No such tool available: Grep. Grep is not available in this session — search file contents with `grep` via the Bash tool instead.</tool_u
- architecture-reviewer / Grep: <tool_use_error>Error: No such tool available: Grep. Grep is not available in this session — search file contents with `grep` via the Bash tool instead.</tool_u
- architecture-reviewer / Grep: <tool_use_error>Error: No such tool available: Grep. Grep is not available in this session — search file contents with `grep` via the Bash tool instead.</tool_u
- architecture-reviewer / Grep: <tool_use_error>Error: No such tool available: Grep. Grep is not available in this session — search file contents with `grep` via the Bash tool instead.</tool_u
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'git status --porcelain | cat; wc 
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'wc -l /Users/mtakumi/Projects/dev
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'ls /Users/mtakumi/Projects/dev-di
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'npx --yes pnpm@10 -C client exec 
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'npx --yes pnpm@10 -C server exec 
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'npx --yes pnpm@10 -C client test 
- plan-verifier / Bash: PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/readonly-bash-guard.sh verify]: readonly-bash-guard(verify): 'npx --yes pnpm@10 -C server test 

## Cost outliers (in + cache_write + out)
median subagent = 124155; threshold = 2x
- #2 implementation-planner (Plan Project Context indexing): 277711 = 2.2x median

## Permission denials / stalls
- none

## AC coverage (spec 26 AC)
- not mentioned in plan: AC-25, AC-26, AC-27, AC-28
- no --report given
- in plan/report but not in spec (stale?): AC-31

## Order of agents

Стартові секунди з таблиці; однакові секунди = паралельно.

1. `spec-creator` (09:05, 1116 s, 26 turns): запускався один раз, але **відновлювався тричі** через `SendMessage` (раунд 1 без файлу, раунд 2 пише спеку, раунд 3-4 правки по відповідях). Між раундами йшли питання користувачу (3 порції `AskUserQuestion` від оркестратора).
2. `implementation-planner` (09:28, 834 s): раунд 1 (питання) і раунд 2 (план) через `SendMessage`.
3. `implementer` ×2 паралельно (09:45:06): лінія S (219 s) і лінія C (90 s).
4. `test-writer` ×2 паралельно (09:48:53): лінія C (177 s) і лінія S (519 s).
5. `check-runner` (09:57:39, 12 s): нічого не запустив, усе заблоковано guard-ом.
6. `architecture-reviewer` ∥ `plan-verifier` (09:59:28): паралельно, 102 s і 115 s.

Не запускались: `plan-translator` (за домовленістю: лише на запит) і `doc-writer` (план його не вимагав).

## Hard

- **`spec-creator` не має `AskUserQuestion`.** Мій промпт казав «ask the user (use AskUserQuestion)»; у звіті: «AskUserQuestion isn't available to me as a subagent… No spec written yet». Раунд 1 був порожнім: агент прочитав код, склав 12 питань і зупинився. Оркестратор мусив ретранслювати 12 питань у 3 викликах. Це відомий патерн (check-list «agents that need a question tool but have none»), але промпт агента й мій делегувальний промпт досі просять його.
- **`check-runner` повністю заблокований guard-ом.** `readonly-bash-guard.sh verify` відхилив усі 6 команд, зокрема форму `pnpm -C <server|client> typecheck|test|lint`, яку сам guard називає дозволеною (3 помилки в `check-runner`). Причина, найімовірніше, у формі `npx --yes pnpm@10 -C …`, яку агенти беруть із секції 8 плану. Наслідок: **повні набори, lint і `.it` як виконані не запускались ні разу** (вердикт `plan-verifier`: INCOMPLETE, а користувач вирішив пропустити).
- **`plan-verifier` наткнувся на той самий guard 7 разів** (`exec vitest`, `test`, `ls`, `wc`, `git status | cat`): усі цілеспрямовані запуски BLOCKED.
- **`architecture-reviewer`: `Grep` недоступний у сесії** (5 помилок «No such tool available: Grep») і `grep` через Bash теж відхилений guard-ом. У звіті 4 пункти «Cannot verify» (`fs.ts`, `mocks.ts`, `schemas.ts`, `types.ts`, частина клієнта) і не міг знайти, чи інші модулі читають нові таблиці.
- **Дизайн-бандл знову розбирав не той, хто його розпакував.** `spec-creator` і `implementation-planner` обидва записали «couldn't extract screen N6 from the bundled design file». Оркестратор уже розпакував його раніше в сесії (manifest base64+gzip → `ScreenContext`, рядки 103–140) і не передав шлях.
- **`test-writer-guard` заблокував shell-redirection** (2 помилки, клієнт і сервер); обидва перейшли на `Write`. Дрібно.
- **Дрібні помилки:** `spec-creator` 2 `Edit` (no-op, рядок не знайдено) серед 29 `Edit`; `implementer` C 2 `Bash` (exit 1 від grep, неправильний відносний шлях у python); оркестратор: `Read` бінарного `.bin`, `AskUserQuestion` без `description` в одному варіанті.

## Easy

- **Лінія C: 9 turns, 90 s.** Чіткий контракт у секції 4 плану, кроки з файлами й правилами, скриншоти 41/42 як шляхи, один `Read` на файл. Єдиний відхил від плану (`useReindexProjectContext(repoId)` → змінна мутації) був усвідомленим і задокументованим.
- **`test-writer` C: 16 turns, усе зелене з першого запуску**, 18 файлів / 73 тести; у звіті чесний список «Not covered».
- **Раунд 2 `spec-creator`/планувальника:** відповіді передано одним повідомленням з усіма рішеннями («accept ALL defaults Q1–Q9»), без перепитувань.
- **План:** 19 AC → кроки → таблиця покриття; верифікатор не знайшов жодного FAIL і підтвердив усі секції §6.
- **INSIGHTS окупились:** `server/INSIGHTS.md` (fs fail-closed, `typecheck` не покриває `server/test/**`) і `client/INSIGHTS.md` (resync завершується за `updatedAt`) прямо вплинули на кроки 7, 17, 24.

## Duplicated

- **Одна й та сама розвідка кодом двічі.** `spec-creator` і `implementation-planner` обидва читали: `project-context/service.ts`, `routes.ts`, `repo-intel/routes.ts`, `repos/service.ts`, `FileListPanel.tsx`, `server|client/AGENTS.md`, `INSIGHTS.md` (корінь, server, client), обидва скриншоти 41/42. Планувальник зробив 43 `Read` + 24 `Grep` значною мірою над тим самим.
- **`server/INSIGHTS.md` і `client/INSIGHTS.md` прочитали по 4 агенти** (spec-creator, planner, implementer, test-writer). Корисно, але кожен перечитує повністю.
- **Файл плану читають 6 агентів**, а 4 з них (test-writer, check-runner, architecture-reviewer, plan-verifier) **двічі кожен**. План ≈700 рядків, check-runner потребував лише секцію 8.
- **`service.ts` проекту прочитали 5 агентів, `ports.ts` і `repository.ts` по 4.** Для рев'ю це потрібно, але bundle (295 KB) окремо не використовувався: `plan-verifier` прямо написав «bundle was not used», `architecture-reviewer` читав bundle частково.
- **Оркестратор переказував кожен звіт користувачу** (main out = 55.1k, 90 turns, cache_read 10.7M). Частково виправдано (користувач читає тільки чат), але звіти планувальника/верифікатора переказувались довго.

## Missed

- **Справжня вада, яку знайшов користувач, а не агенти: Re-index читає застарілий клон.** `POST /repos/:id/refresh` ставить clone job, а для наявного клона `clone()` робить лише `git fetch` (`adapters/git/simple-git.ts:50-55`), HEAD не рухається; `stale` порівнює індекс із локальним HEAD, тож лишається `false`. Користувач не побачив `specs/` після реіндексу; допоміг лише repo-intel `POST /resync` (`reset --hard`). `implementation-planner` прочитав `repos/service.ts` і `repo-intel/routes.ts`, навіть поставив Q6 про resync, але узяв дефолт «AC-10 literally» і не помітив, що refresh не пересуває дерево. `spec-creator` теж читав ці файли. **Ніхто не запускав живу перевірку (M1–M4).**
- **Не виконано:** повні набори тестів і lint, ручні браузерні M1–M4 проти скриншотів, NFR 300 ms / 30 s не вимірювались.
- **Відкриті знахідки:** ARCH-1 (`inflight` читається після snapshot: хибний toast через 150 s), ARCH-2, ARCH-4 (800 у двох місцях), VER-2 (зсунуті AC-теги в `ProjectContextView.test.tsx`), VER-1 (банер у старій спеці vs «specs read-only»).
- **Прогалини тестів (за звітом test-writer):** таймаут job на Postgres (`JobRunner` не інжектується), AC-12 для `indexing` і PR Brief, гонка таймаут/коміт.
- **Відкладене рішення користувача:** підзаголовок над іконками (`.devdigest/specs/` на скриншоті vs назва репозиторію за AC-7) лишився як non-blocking OQ.
- **Не записано нікуди:** факт, що `refresh` лише fetch (вище), і що `plan-verifier`/`architecture-reviewer` не мають grep/test у цій сесії, — кандидати в INSIGHTS.

## Outliers & permission stalls

- **#2 implementation-planner: 277,711 (2.2× медіани).** Причина: 43 `Read` + 24 `Grep` + 6 `Glob` у двох раундах, найбільший `out` (30k) через ~700-рядковий план, повторна розвідка поверх `spec-creator` (див. Duplicated). Користь: план справді повний (16 знайдених прогалин, з реальними: таймаут не зупиняє job, `IconBtn` не підтримує disabled, `readRaw`, друга інстанція сервісу). Але пропустив refresh-vs-resync, тож частина вартості не окупилась.
- **Біля порогу: test-writer S 228,724 (1.84×)**, 35 turns, 74 викликів, cache_read 5.7M. Окупився: 27 `.it`-тестів, зокрема AC-8 (паралельні `GET` під час перебудови).
- **Permission denials (скрипт: none), але guard-блоки є:** `readonly-bash-guard` — check-runner 3, plan-verifier 7, architecture-reviewer 1; `test-writer-guard` — test-writer 2. Це не відмови користувача, а hook-помилки; кожен зупинив або урізав роботу агента. Повторювані відмови тієї самої форми команди → потрібен allowlist-запис або команди в плані мають бути у дозволеній формі (див. рекомендацію 1).

## AC coverage

Скрипт порахував «26 AC» у спеці та повідомив: не згадані в плані AC-25…28, у плані зайвий AC-31. Перевірка вручну: **це хибні спрацювання.** Нова спека (AC-1…AC-19) посилається на ідентифікатори *старої* спеки («old AC-24 to AC-29», «old AC-25 and old AC-28 unchanged», «old AC-36»), а план у кроці 25 згадує AC-24/31 зі старої спеки. Власні AC-1…19 усі є в таблиці секції 8; `plan-verifier` підтвердив: кожен має ≥1 крок і ≥1 тест, FAIL 0. Справжніх прогалин по AC немає; прогалина в **перевірці виконання** (див. Missed), а не в покритті.

## vs previous

Порівняно з [ретро реалізації 2026-10-11](retro-2026-10-11-project-context-run.md): тоді оркестратор мав 291k in / 101k out і 99 викликів, планувальник 231k in / 13k out; тепер оркестратор 177k in (cache_w+in) / 55.1k out і 69 викликів, планувальник 247k in / 30k out (удвічі більший вивід: план для двох пакетів із міграцією). Різниця за якістю: тоді повні набори запускались, цього разу ні (guard), тому повної верифікації виконання немає.

## Recommendations

Ранжовано за запобіганням переробці/токенам.

1. **Узгодити команди плану з allowlist `readonly-bash-guard.sh`** (`.claude/hooks/readonly-bash-guard.sh`, секція 8 вимог у `.claude/agents/implementation-planner.md`): або дозволити `npx --yes pnpm@10 -C <pkg> typecheck|test|lint|exec vitest run …` і `grep`/`wc`/`ls` у режимі `verify`/`git`, або вимагати від планувальника писати команди лише у формі `pnpm -C <pkg> …`. Без цього `check-runner` і `plan-verifier` марні (≈40k + 160k токенів без виконаних перевірок).
2. **Додати у `/run-plan` обов'язковий крок «live check» і блокувати «COMPLETE» без нього** (`.claude/skills/run-plan`): мінімум один живий виклик API/браузер для UI-змін, плюс правило «stale/refresh/sync»: для фіч, що читають клон, перевіряти, чи оновлюється робоче дерево. Саме цього не вистачило, щоб піймати вади refresh.
3. **Прибрати «use AskUserQuestion» з промпта `spec-creator`** (`.claude/agents/spec-creator.md`): замінити на «return one batch of numbered questions with defaults; the orchestrator asks the user». Заощаджує один порожній раунд (≈150k токенів, 3 відновлення).
4. **Спільний файл фактів між spec-creator і planner** (напр. `.claude/sdd-runs/<feature>-facts.md` або секція в спеці «Code reconnaissance»): перелік прочитаних файлів і ключових висновків, щоб планувальник не повторював 15+ читань. Додатково оркестратор передає шлях до розпакованого дизайну (`ScreenContext`, рядки 103–140) замість того, щоб агенти шукали заново.
5. **Агенти-рев'юери: дати їм `grep` (read-only) у guard** (`readonly-bash-guard.sh git`/`verify`) або прибрати `Grep` зі списку tools там, де він недоступний (`architecture-reviewer.md`). Інакше «Cannot verify» поглинає ключові файли (`fs.ts` — питання безпеки).
6. **Скоротити перечитування плану:** `check-runner` і `test-writer` отримують лише потрібну секцію (шляхи/діапазони рядків у промпті), `plan-verifier` — повний. Мета: прибрати 8 дублікатних читань ~700-рядкового файлу.
7. **Скрипт `session_stats.py`: підтримка «amends old spec».** Параметр `--old-spec` або ігнорування `old AC-N`, щоб не плодити хибні «не згадані в плані»; та рядок про блокування guard-ами (hook-помилки) окремо від user-denials, бо зараз «Permission denials: none» маскує 13 блоків.

Також варто записати в `server/INSIGHTS.md`: `POST /repos/:id/refresh` лише fetch'ить, HEAD клона не рухається, тому індекс/discovery після refresh бачать старе дерево; потрібен `resync` (або зміна refresh). Запитаю дозвіл окремо.
