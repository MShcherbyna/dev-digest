# План розробки: Smart Diff (вкладка "Files changed" з групуванням за ролями та вбудованими знахідками)

## 1. Мета та обсяг

**Мета.** На вкладці "Files changed" на сторінці деталей PR показувати змінені файли, згруповані за ролями в такому порядку: **core → tests → wiring → docs → boilerplate**. Кожна група має заголовок із міткою ролі, однорядковий опис, кількість файлів, і (після запуску перевірки) червону точку та кількість *файлів* у цій групі, що мають принаймні одну знахідку. Розгортувані розділи групи починаються закритими для `docs` і `boilerplate`. Картка файлу з знахідками показує просту точку поруч із шляхом. Коли файл розширено, кожна знахідка відображається вбудовано під точно його рядком коду (узгоджено за `start_line`), використовуючи наявне `FindingCard` з Agent-запусків (severity, title, rationale, Accept/Dismiss). Рядок коду отримує кольорову смугу ліворуч та правовирівняну мітку: CRITICAL→`blocker`, WARNING→`warning`, SUGGESTION→`suggestion`. Перемикач "Smart order / Original order" перемикає назад до наявного плоского списку в порядку GitHub.

На стороні сервера: чистий, повторно використовуваний класифікатор `classifyFile(path)` без залежностей HTTP або БД (пізніше завдання L08 повторно його використовуватиме як фільтр збірки промпту), і новий маршрут `GET /pulls/:id/smart-diff`, що повертає контракт `SmartDiffResponse`.

**Не-цілі.**
- `pseudocode_summary`: завжди `null`. Реальний `split_suggestion`: завжди `too_big: false`, `proposed_splits: []`. Наявні ключі `smartDiff.largeTitle` / `largeBody` i18n залишаються невикористаними.
- Без змін схеми БД та без міграції.
- Без змін вкладки Findings, `FindingsPanel` або спливаючого вікна списку PR.
- Наявні жорстко кодовані англійські рядки в `DiffTab` ("Files changed · N files", "Show/Hide comments") не переміщуються до i18n. Вони виходять за межі обсягу.
- Без нового потоку e2e (`e2e/`). Перевірка браузером є ручною (розділ 8).
- Клієнт не класифікує файли самостійно. Роль завжди походить від сервера.

## 2. Контекст для читання

Файли для читання (всі під `/Users/mtakumi/Projects/dev-digest/`):
- `CLAUDE.md`, `server/AGENTS.md`, `client/AGENTS.md`, `INSIGHTS.md`,
  `server/INSIGHTS.md`, `client/INSIGHTS.md`
- Навички: `onion-architecture`, `fastify-best-practices` (+ `rules/routes.md`),
  `zod` (+ `AGENTS.md`), `react-frontend-architecture`, `react-best-practices`,
  `react-testing-library`, `security`, `typescript-expert` (head), `design`,
  `engineering-insights`
- Сервер: `src/app.ts`, `src/modules/index.ts`, `src/modules/_shared/{context,schemas}.ts`,
  `src/modules/reviews/{routes,service,repository,helpers}.ts`,
  `src/modules/reviews/repository/{pull.repo,review.repo}.ts`,
  `src/modules/pulls/routes.ts`, `src/modules/intent/{routes,repository,ports}.ts`,
  `src/modules/translation/{routes,repository,ports}.ts`,
  `src/vendor/shared/contracts/{brief,review-api}.ts`, `vitest.config.ts`,
  `test/contracts.test.ts` (SmartDiff case), `test/reviews.it.test.ts` (head),
  `test/routes-smoke.test.ts`, `reviewer-core/src/review/reduce.ts`,
  `reviewer-core/src/grounding.ts` (grep: grounding uses **new-file** line numbers)
- Клієнт: `src/app/repos/[repoId]/pulls/[number]/page.tsx`,
  `_components/DiffTab/DiffTab.tsx`, `_components/FindingCard/{FindingCard.tsx,constants.ts,helpers.ts,styles.ts,FindingCard.test.tsx}`,
  `_components/FindingsTab/FindingsTab.tsx`, `_components/ReviewRunAccordion/ReviewRunAccordion.tsx`,
  `_components/FindingsPanel/FindingsPanel.tsx`,
  `src/components/diff-viewer/{index,comments,constants,helpers,styles}.ts`,
  `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`,
  `src/lib/hooks/{reviews,keys}.ts`, `src/lib/api.ts` (head), `src/lib/types.ts`,
  `src/lib/providers.tsx` (grep: `staleTime: 30_000`), `src/test/{smoke.test.tsx,render-intl.tsx}`,
  `src/vendor/ui/kit/Tabs.tsx`, `src/vendor/ui/primitives/tokens.ts` (`SEV`),
  `messages/en/prReview.json`, `messages/en/shell.json` (`diffViewer` block)
- `design/DevDigest Design (standalone) (3).html`: grep знайшов жодних рядків Smart Diff
  (файл є бандлом). Скріншоти чату, як описано координатором,
  є єдиним візуальним посиланням.

Відповідні записи INSIGHTS:
- `INSIGHTS.md` (root), 2026-09-18, уточнено 2026-09-20: *"`server/src/vendor/shared`
  і `client/src/vendor/shared` призначені як один пакет контрактів, але
  немає скрипту синхронізації між ними … Не перезаписуйте одну копію іншою;
  вставляйте тільки блок, який ви власните, в обидва місця"*. Це регулює крок 1.
- `server/INSIGHTS.md`, 2026-09-18: *"Стовпці 'latest review' списку PR … обчислюються одним запитом `IN`
  проти `reviews`, упорядковані `desc(createdAt)`,
  first-seen-per-PR в JS … Нова метрика, яка мусить походити з ТОГО ЖЕ запуску як
  наявна (наприклад score) повинна `leftJoin` на той же запит"*. Це джерело
  правила "latest review", обраного на кроці 6.
- `client/INSIGHTS.md`, 2026-09-24: *"`client/src/lib/feature-models.ts` — це
  ручно дзеркальна копія … (клієнт не може імпортувати спільні часові значення)"*. Тому
  клієнт не повинен покладатися на `SmartDiffRole.options` під час виконання. Порядок групи походить
  від відповіді сервера (крок 16).
- `client/INSIGHTS.md`, 2026-09-20: *"`@testing-library/user-event` НЕ є залежністю клієнта …
  тести компонента використовують `fireEvent`-базований шим `src/test/user.ts`
  … та `src/test/render-intl.tsx`"*. Це перекриває правило RTL skill "завжди
  userEvent" (крок 20).
- `client/INSIGHTS.md`, 2026-09-19: *"Ніколи не запускайте `next build` в `client/` під час
  `pnpm dev`"*. Релевантно для валідації.
- `INSIGHTS.md` (root), Tool notes 2026-09-18: *"`pnpm` не на `PATH` … використовуйте
  `npx --yes pnpm@10 <cmd>`"*, і Docker Desktop мусить бути запущений для `.it.test.ts`.

## 3. Задіяні модулі

**server/**
- `src/vendor/shared/contracts/brief.ts`: **змінено**. Розширити `SmartDiffRole`
  (санкціонована винятка, див. розділ 4).
- `src/modules/reviews/smart-diff/constants.ts`: **нове**. `ROLE_ORDER` (порядок
  відображення), `CLASSIFY_PRECEDENCE` та дані з шаблонами за роллю.
- `src/modules/reviews/smart-diff/classify.ts`: **нове**. Чистий
  `classifyFile(path): SmartDiffRole`.
- `src/modules/reviews/smart-diff/classify.test.ts`: **нове**. Табличний модульний тест.
- `src/modules/reviews/smart-diff/build.ts`: **нове**. Чистий
  `buildSmartDiff(files, anchors): SmartDiff`.
- `src/modules/reviews/smart-diff/build.test.ts`: **нове**. Модульний тест.
- `src/modules/reviews/repository/review.repo.ts`: **змінено**. Додати
  `latestReviewFindingAnchors(db, prId)`.
- `src/modules/reviews/repository.ts`: **змінено**. Делегувати метод на
  `ReviewRepository`.
- `src/modules/reviews/service.ts`: **змінено**. Додати
  `ReviewService.smartDiff(workspaceId, prId)`.
- `src/modules/reviews/routes.ts`: **змінено**. Додати маршрут `GET /pulls/:id/smart-diff`
  і оновити коментар заголовка.
- `test/contracts.test.ts`: **змінено**. Розібрати нові ролі.
- `test/reviews.it.test.ts`: **змінено**. Випадки інтеграції маршруту.

**client/**
- `src/vendor/shared/contracts/brief.ts`: **змінено**. Байт-ідентично копії сервера.
- `messages/en/prReview.json`: **змінено**. Ключі під `smartDiff`.
- `messages/en/shell.json`: **змінено**. Ключі під `diffViewer`.
- `src/lib/hooks/keys.ts`: **змінено**. Ключ `prSmartDiff`.
- `src/lib/hooks/reviews.ts`: **змінено**. Hook `usePrSmartDiff`.
- `src/components/diff-viewer/findings.ts`: **нове**. Тип `DiffFindingsApi` плюс чисті
  допоміжні функції якорення.
- `src/components/diff-viewer/findings.test.ts`: **нове**.
- `src/components/diff-viewer/constants.ts`: **змінено**. Рейтинг важкості та ключі мітки рядка.
- `src/components/diff-viewer/styles.ts`: **змінено**. Точка, смуга, мітка та стилі знахідок-рельс.
- `src/components/diff-viewer/CodeLine/CodeLine.tsx`: **змінено**. Смуга, мітка,
  та вбудовані знахідки.
- `src/components/diff-viewer/FileCard/FileCard.tsx`: **змінено**. Точка знахідок,
  якорення та не якіровані знахідки.
- `src/components/diff-viewer/DiffViewer/DiffViewer.tsx`: **змінено**. Передає
  `findings` далі.
- `src/components/diff-viewer/index.ts`: **змінено**. Також експортує `FileCard` і
  `type DiffFindingsApi`.
- `src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`: **змінено**.
- `.../DiffTab/helpers.ts`: **нове**. `latestReview`, `buildViewGroups`, `findingsByPath`,
  `linesByPath`.
- `.../DiffTab/helpers.test.ts`: **нове**.
- `.../DiffTab/DiffTab.test.tsx`: **нове**.
- `.../DiffTab/_components/SmartDiffGroups/{SmartDiffGroups.tsx,constants.ts,styles.ts,index.ts,SmartDiffGroups.test.tsx}`: **нове**.
- `src/app/repos/[repoId]/pulls/[number]/page.tsx`: **змінено**. Передає
  `repoFullName`/`headSha` до `DiffTab` і робить недійсним smart-diff в `onRunDone`.

**reviewer-core/**, **e2e/**: без змін.

## 4. Задіяні контракти

- **`SmartDiffRole`** в `server/src/vendor/shared/contracts/brief.ts:81` і
  `client/src/vendor/shared/contracts/brief.ts:81`. Змінити
  `z.enum(['core', 'wiring', 'boilerplate'])` на
  `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. Напишіть учасників
  точно в цьому порядку, який також є порядком відображення.
  **Це явна, санкціонована завданням винятка з правила do-not-touch vendor/shared.** Змінюються лише ці два рядки: вставте один рядок в обидві
  копії, і не копіюйте один файл поверх іншого (root INSIGHTS). Координатор
  перевірив, що дві копії `brief.ts` є байт-ідентичними перед редагуванням. Після
  редагування `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`
  не повинна друкувати нічого.
- `SmartDiffFile`, `SmartDiffGroup`, `SmartDiff`, `ProposedSplit`: без змін.
- `SmartDiffResponse` (`contracts/review-api.ts:64`, обидві копії): повторно використовується без змін
  як `response: { 200: … }` схема маршруту та як тип отримання даних клієнтом.
- `FindingRecord` / `ReviewRecord` (`review-api.ts`): читанння лише на клієнті.
- Без змін схеми БД. Без міграції. Без нових портів. Без нового входу контейнера.
- **Новий HTTP кінцевий пункт:** `GET /pulls/:id/smart-diff`. `:id` — це uuid, перевірений
  `IdParams`. Повертає `200 SmartDiffResponse`, або `404 {error:{code:'not_found'}}`
  коли PR не знаходиться у робочій області абонента (той же шлях `NotFoundError` як
  `GET /pulls/:id/reviews`), або `422` для non-uuid id.

## 5. Навички для розробника

| Навичка | Регулює | Ключові правила для цього завдання |
|---|---|---|
| **onion-architecture** | Кроки 2–8 | `classify.ts`/`build.ts` імпортують лише TS та *тип* з `@devdigest/shared` (без fastify/drizzle/zod runtime). Новий метод репозиторія повертає відображену форму `{file,startLine}[]`, не рядки `$inferSelect`. Маршрут лише розбирає вхідні дані, викликає один метод сервісу та повертає результат. |
| **fastify-best-practices** | Крок 8 | Оголосіть `schema: { params: IdParams, response: { 200: SmartDiffResponse } }` щоб одна Zod схема керувала валідацією і серіалізацією (як у `intent/routes.ts:18-26`). Не ручний `.parse`. Помилки викидаються як `NotFoundError` зі сервісу та зіставляються глобальним обробником. |
| **drizzle-orm-patterns** | Крок 6 | Виберіть тільки необхідні стовпці. Використовуйте `.orderBy(desc(createdAt)).limit(1)` для останньої перевірки. Без змін схеми, тому без `db:generate`. |
| **zod** | Кроки 1, 8 | `schema-use-enums`: розширити перелік і не розслаблювати його до `z.string()`. `type-use-z-infer`: триматися `SmartDiffRole` як `z.infer`. Валідуйте тільки на межі (схема маршруту). |
| **typescript-expert** | Кроки 1–5, 12–17 | Карти `Record<SmartDiffRole, …>` мають бути вичерпними, тому розширення переліку розповсюджує кожну відсутню роль при typecheck. Без `any`. |
| **react-frontend-architecture** | Кроки 11–19 | Розташуйте близько: `SmartDiffGroups` живе під `DiffTab/_components/` (один споживач). Спільна `diff-viewer` не повинна імпортувати з `app/**`, тому `FindingCard` вводиться через `DiffFindingsApi.renderFinding`. Дані йдуть через `lib/hooks` → `api.ts`. Дані сервера ніколи не копіюються в `useState`. Рядки йдуть в `messages/`. |
| **react-best-practices** | Кроки 13–18 | Походять, не зберігайте: групи, кількість і якорі обчислюються при відображенні або `useMemo`. Лише стан UI йде в `useState` (перемикач порядку, закриті групи). Використовуйте `count > 0 &&`, ніколи `count &&`. Стійкі ключі: шлях файлу та id знахідки, не індекс. Індикатори лише іконки або точки отримують `aria-label`. |
| **react-testing-library** | Крок 20 | Потоки 1–3 на компонент, запитані за ролю або текстом. Виглядаєте на межі hook/API. **Перекриття:** використовуйте `src/test/user.ts` / `fireEvent`, не `userEvent` (не встановлено; client INSIGHTS). |
| **security** | Кроки 6–8, 13 | A01: область видимості робочої зони через `getContext` + `getPull(workspaceId, prId)` перед будь-яким читанням. Шляхи файлів і текст знахідок відображуються лише через JSX або наявні `Markdown` (без `dangerouslySetInnerHTML`). Класифікатор використовує лише рядкові операції, без `RegExp` побудованих з вхідних даних (A05 ReDoS). |
| **design** | Кроки 10, 13, 14, 17, 18 | Скріншоти чату є джерелом істини. Жодна графіка крім: перемикач, заголовок групи (мітка, опис, точка знахідок-файлу і кількість, кількість файлів), точка файлу, смуга і мітка рядка, вбудована FindingCard. |

`next-best-practices` не застосовується: без змін маршруту, макета або межі RSC.
Всі торкнені компоненти вже мають `"use client"`. `drizzle-kit` /
`postgresql-table-design` не застосовуються, оскільки схема БД не змінюється.

## 6. Обмеження архітектури

- **Домівка сервера модуля: всередину `reviews`** (`server/src/modules/reviews/smart-diff/`).
  Smart diff — це модель читання над даними, якими модуль `reviews` вже володіє:
  `pr_files` через `ReviewRepository.getPrFiles`, PR через `getPull`, і
  `reviews`/`findings`. Брат `GET /pulls/:id/reviews` також жив тут, і
  майбутній фільтр складання промпту L08 запуститься в `reviews/run-executor.ts`,
  тому модуль може імпортувати `smart-diff/classify.ts` прямо без
  міжмодульного досяг. Відхилені альтернативи:
  - Новий `modules/smart-diff/`: він повинен або імпортувати
    `reviews/repository/pull.repo.ts` (заборонено onion-architecture: "модуль
    не імпортує … репозиторій іншого модуля") або повторно запитати PR та файли в
    своєму репозиторії, що завдання забороняє.
  - `modules/pulls/`: він не має розділення сервіс/репозиторій, і додавання одного
    тільки для цього маршруту витягне більше старого коду в область видимості.
- Тримайте `routes.ts → service.ts → repository.ts`. `ReviewService` вже приймає
  цілий `Container` (спадок). Не рефакторіть це. Просто додайте метод.
- `classify.ts` і `build.ts` мають залишатися вільними від Fastify, Drizzle, Zod runtime
  імпортів та `Container`, щоб їх можна було викликати без контексту HTTP. Дозволений
  імпорт: `import type { SmartDiffRole, SmartDiff } from '@devdigest/shared'`.
- Клієнт: спільна `src/components/diff-viewer/**` ніколи не повинна імпортувати з
  `src/app/**`. Функція вводить рендеринг `FindingCard` через
  `DiffFindingsApi`.
- Назвоутворення на клієнті: `SmartDiffGroups/` — це папка PascalCase з
  братськими файлами нижчого регістру та `index.ts`, який повторно експортує лише компонент. Нові файли lib/helper
  нижчого регістру.
- Тести розташовуються поряд з тим, що вони перевіряють, з тією же основною назвою (`classify.test.ts`,
  `build.test.ts`, `findings.test.ts`, `helpers.test.ts`,
  `SmartDiffGroups.test.tsx`, `DiffTab.test.tsx`). Server `vitest.config.ts:14`
  вже включає `src/**/*.test.ts`. Випадок інтеграції маршруту розширює
  наявний `server/test/reviews.it.test.ts` (Testcontainers suite).
- Не трогайте: `client/src/vendor/ui/**` (перемикач побудований із наявного
  `Button`), `server/src/db/migrations/**`, і всі `pnpm-lock.yaml`. **Немає нової
  залежності:** глоби збігаються вручну написаними предикатами рядків, не
  `minimatch`/`picomatch`, оскільки залежність вимагатиме змін файлу блокування.
  `*/vendor/shared/**` торкається лише санкціонованого рядка `SmartDiffRole`.

## 7. Кроки

**Крок 1: Розширити контракт (обидві копії).** *zod, typescript-expert*
Файли: `server/src/vendor/shared/contracts/brief.ts:81` і
`client/src/vendor/shared/contracts/brief.ts:81`. Замініть перелік на
`z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. Нічого іншого в
жодному файлі не змінюється. Потім:
- запустіть `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`,
  який не повинен друкувати нічого;
- запустіть `grep -n "review-api" server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts`
  щоб підтвердити, що `SmartDiffResponse` експортується з `@devdigest/shared`. Він вже
  імпортується таким чином на клієнтському шляху типів. Якщо його *не* експортовано,
  зупиніться і повідомте, а не редагуйте `index.ts`.

**Крок 2: Константи класифікатора.** *onion-architecture*
Файл: `server/src/modules/reviews/smart-diff/constants.ts` (нове). Експортуйте:
- `ROLE_ORDER: readonly SmartDiffRole[] = ['core','tests','wiring','docs','boilerplate']`,
  **порядок відображення** груп.
- `CLASSIFY_PRECEDENCE = ['boilerplate','tests','wiring','docs'] as const`, **порядок**
  **збігу** (перший збіг перемагає, `core` — резервне). Поставте коментар
  на ньому, кажучи, що два порядки свідомо різні.
- Дані шаблонів за роллю як простий `as const` масиви рядків (без функцій, без RegExp):
  - boilerplate: `BOILERPLATE_BASENAMES = ['pnpm-lock.yaml','package-lock.json','yarn.lock']`,
    `BOILERPLATE_SUFFIXES = ['.lock','.snap','.min.js']`,
    `BOILERPLATE_INFIXES = ['.generated.']`,
    `BOILERPLATE_ROOT_DIRS = ['dist','build']`,
    `BOILERPLATE_ANY_DIRS = ['__snapshots__']`.
  - tests: `TEST_SUFFIXES = ['.test.ts','.test.tsx','.spec.ts']` (`.it.test.ts`
    охоплюється `.test.ts`), `TEST_ANY_DIRS = ['test','tests','__tests__']`,
    `TEST_ROOT_DIRS = ['e2e']`.
  - wiring: `WIRING_BASENAMES = ['index.ts','index.js']`, `WIRING_INFIXES = ['.config.']`,
    `WIRING_PREFIXES = ['.eslintrc','.env']`, `tsconfig*.json` (префікс `tsconfig`
    + суфікс `.json`), `docker-compose*.yml` (префікс `docker-compose` + суфікс
    `.yml`), `WIRING_ROOT_DIRS = ['.github','.claude']`.
  - docs: `DOCS_SUFFIXES = ['.md']`, `DOCS_ROOT_DIRS = ['docs']`,
    `DOCS_PREFIXES = ['README','CHANGELOG']`, `DOCS_BASENAMES = ['LICENSE']`.

**Крок 3: `classifyFile`.** *onion-architecture, security, typescript-expert*
Файл: `server/src/modules/reviews/smart-diff/classify.ts` (нове). Експортуйте
`classifyFile(path: string): SmartDiffRole`. Семантика (gitignore-стиль; документуйте
їх у JSDoc):
- Нормалізуйте: замініть `\` на `/` і видаліть провідні `./`. Розділіть на
  `dirs` (всі сегменти крім останнього) і `base` (останній сегмент).
- Шаблон **без `/`** (`*.lock`, `index.ts`, `.env*`, `*.config.*`, `*.md`,
  `README*`) збігається з **basename на будь-якій глибині**.
- Шаблон форми `x/**` (`dist/**`, `build/**`, `e2e/**`, `docs/**`,
  `.github/**`, `.claude/**`) — **root-anchored**: `dirs[0] === x`. Це дотримується
  спеку буквально: лише `__snapshots__`, `test`, `tests`, `__tests__` використовують
  `**/`, тому `client/dist/a.js` — **не** boilerplate.
- `**/dir/**` збігається, коли `dirs` містить `dir` (сегменти директорій лише, не
  basename).
- Оцініть ролі у порядку `CLASSIFY_PRECEDENCE` і поверніть першу збігу, інакше
  `'core'`. Реалізуйте як один малий предикат на роль
  (`isBoilerplate`/`isTest`/`isWiring`/`isDocs`), який читає дані Кроку 2,
  відправлені через `Record<Exclude<SmartDiffRole,'core'>, (p) => boolean>`.
  Збіг чутливий до регістру, з лише `String.prototype`
  `startsWith/endsWith/includes/===`.

**Крок 4: Модульний тест класифікатора.** *react-testing-library не застосовується; дотримуйтеся правил zod/TS для фіксрейків*
Файл: `server/src/modules/reviews/smart-diff/classify.test.ts` (нове). Використовуйте один
таблиця `it.each` з `[path, expectedRole]`. Вона повинна містити кожен рядок,
перелічений у розділі 8, включаючи три випадки пріоритетності.

**Крок 5: `buildSmartDiff` + тест.** *onion-architecture*
Файл: `server/src/modules/reviews/smart-diff/build.ts` (нове).
Підпис:
`buildSmartDiff(files: {path:string; additions:number; deletions:number}[], anchors: {file:string; startLine:number}[]): SmartDiff`.
- Класифікуйте кожен файл за допомогою `classifyFile`. Тримайте порядок введення файлів
  у межах ролі (клієнт змінює порядок на GitHub все одно, див. крок 16).
- `finding_lines` для файлу — це **унікальні, за зростанням** `startLine` кожного
  якоря, чий `file === path` (точна рівність рядків). Якорі для шляхів, не в
  `files`, ігноруються.
- `pseudocode_summary: null`.
- Групи випускаються в `ROLE_ORDER`, **опускаючи ролі з нульовою кількістю файлів**. Це
  збігається зі скріншотами, які показують лише заповнені групи.
- `split_suggestion = { too_big: false, total_lines: Σ(additions+deletions), proposed_splits: [] }`.

Файл: `server/src/modules/reviews/smart-diff/build.test.ts` (нове). Випадки: порядок групи,
опускання порожньої-ролі, дедупе/сортування finding_lines, якір зовнішнього шляху
ігнорується, сума `total_lines`, і пустий введення файлів, даючи `{groups: [], total_lines: 0}`.

**Крок 6: Репозиторій: якорі останньої перевірки.** *drizzle-orm-patterns, onion-architecture*
Файл: `server/src/modules/reviews/repository/review.repo.ts`. Додайте
`latestReviewFindingAnchors(db, prId): Promise<{ file: string; startLine: number }[]>`:
1. `select({ id: t.reviews.id }).from(t.reviews).where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review'))).orderBy(desc(t.reviews.createdAt)).limit(1)`.
2. Якщо рядка немає, повіртніть `[]`. Інакше
   `select({ file: t.findings.file, startLine: t.findings.startLine }).from(t.findings).where(eq(t.findings.reviewId, id))`.
   Включіть **всі** знахідки цієї перевірки (прийняті, відхилені, та будь-який `kind`),
   так само, як `ReviewRunAccordion` рахує `findings.length`.
**Правило "Latest review" (вирішено):** новіший рядок `reviews` з `kind='review'`
за `created_at`. Це те саме правило, що PR список використовує для своїх стовпців score та
findings (`server/src/modules/pulls/routes.ts:120-131`), і перевірка, яку вкладка Findings
відкриває за замовчуванням (`FindingsTab.tsx:162`, `defaultOpen={i === 0}`
над найновішим-першим списком). Тому знахідки, виділені в diff, збігаються з розбиттям
знахідок PR списку.
Файл: `server/src/modules/reviews/repository.ts`. Додайте делегуючий
`latestReviewFindingAnchors(prId)` до `ReviewRepository`, поруч з `reviewsForPull`.

**Крок 7: Метод сервісу.** *onion-architecture*
Файл: `server/src/modules/reviews/service.ts` (розділ Reads, після
`reviewsForPull`). Додайте
`async smartDiff(workspaceId: string, prId: string): Promise<SmartDiff>`:
- викличте `this.repo.getPull(workspaceId, prId)`, і викиньте `NotFoundError('Pull request not found')` якщо відсутній;
- `const [files, anchors] = await Promise.all([this.repo.getPrFiles(prId), this.repo.latestReviewFindingAnchors(prId)])`;
- `return buildSmartDiff(files.map(f => ({ path: f.path, additions: f.additions, deletions: f.deletions })), anchors)`.

**Крок 8: Маршрут.** *fastify-best-practices, zod, security*
Файл: `server/src/modules/reviews/routes.ts`. У розділі "Reads", після
`GET /pulls/:id/reviews` (рядки 129-132), додайте:
`app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.smartDiff(workspaceId, req.params.id); });`
Імпортуйте `SmartDiffResponse` з `@devdigest/shared`. Додайте рядок до коментаря
заголовка (рядки 10-17): `GET /pulls/:id/smart-diff → files grouped by role + latest-review finding lines`.
Без обмеження частоти на маршрут: це дешева операція читання БД, охоплена глобальним
обмеженням.

**Крок 9: Тести контракту та інтеграції сервера.** *zod, fastify-best-practices*
- `server/test/contracts.test.ts:107-118`. Додайте випадок, де `SmartDiff.parse`
  приймає групи з ролями `tests` і `docs`, і `SmartDiffRole.parse('other')` викидає.
- `server/test/reviews.it.test.ts`. Додайте випадки всередину наявного `d(...)` люка,
  повторно використовуючи `setupRepoAndPr` (один файл `src/config.ts`, тому `core`):
  (a) перед будь-якою перевіркою, `GET /pulls/:id/smart-diff` повертає 200 з
  `groups = [{ role:'core', files:[{ path:'src/config.ts', additions:1, deletions:0, finding_lines:[], pseudocode_summary:null }] }]`
  і `split_suggestion.total_lines = 1`;
  (b) після наявного потоку перевірки (`REVIEW_FIXTURE` з обґрунтованою знахідкою
  на рядку 11), `finding_lines` є `[11]`;
  (c) випадковий uuid повертає 404;
  (d) `GET /pulls/not-a-uuid/smart-diff` повертає 422.
  Дзеркальте як люк вже запускає перевірку та чекає (`waitForPrRuns`). The
  мок `openrouter` intent в `appWith()` вже існує (server INSIGHTS
  2026-09-24).

**Крок 10: Рядки i18n.** *design, react-frontend-architecture*
- `client/messages/en/prReview.json`, блок `smartDiff` (наявні ключі не
  використовуються ніде, перевірено grep):
  - змініть `coreLabel` з `"Core"` на `"Core logic"` (мітка зі скріншота);
  - додайте `testsLabel: "Tests"`, `docsLabel: "Docs"`;
  - додайте описи: `coreDescription: "The substance of the change — review closely"`,
    `wiringDescription: "Hooks the core into the app"`,
    `boilerplateDescription: "Generated / mechanical — skim"`,
    `testsDescription: "Proves the change works"`,
    `docsDescription: "Explains the change"` (підтверджено координатором зі
    скріншотів чату — без заповнювача);
  - додайте `smartOrder: "Smart order"`, `originalOrder: "Original order"`,
    `orderToggleLabel: "File order"` (group `aria-label`), і
    `filesWithFindings: "{count} files with findings"` (`aria-label` для групового заголовка точки);
  - тримайте `filesCount: "{count} files"` як є.
- `client/messages/en/shell.json`, блок `diffViewer`: додайте
  `hasFindings: "Has findings"` (файлова точка `aria-label`/`title`) і
  `findingLabel: { "CRITICAL": "blocker", "WARNING": "warning", "SUGGESTION": "suggestion" }`.

**Крок 11: Hook даних.** *react-frontend-architecture*
- `client/src/lib/hooks/keys.ts`: додайте
  `prSmartDiff: (prId) => ["reviews", prId, "smart-diff"] as const`. Він сидить під
  префіксом `reviews(prId)` **спеціально**, тому кожна наявна
  `invalidateQueries({queryKey: queryKeys.reviews(prId)})` (run review,
  accept/dismiss, delete review, delete run) також освіжує smart diff.
  Прокоментуйте це.
- `client/src/lib/hooks/reviews.ts`: додайте
  `usePrSmartDiff(prId)` = `useQuery({ queryKey: queryKeys.prSmartDiff(prId), queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`), enabled: !!prId })`.
  Імпортуйте тип `SmartDiffResponse` з `@devdigest/shared`.

**Крок 12: Слюдяниця diff-viewer findings (спільна, feature-agnostic).** *react-frontend-architecture, typescript-expert*
- `client/src/components/diff-viewer/findings.ts` (нове), модельовано на `comments.ts`:
  - `export interface DiffFindingsApi { linesByPath: ReadonlyMap<string, readonly number[]>; byPath: ReadonlyMap<string, FindingRecord[]>; renderFinding: (f: FindingRecord) => React.ReactNode; }`.
    `linesByPath` походить від сервера `finding_lines` і керує точкою файлу.
    `byPath` тримає рекорди знахідок останньої перевірки і керує вбудованими картками.
    `renderFinding` мусить повернути елемент *стійкого* типу компонента (абонент
    повертає `<FindingCard …/>`), щоб ідентичність компонента не створювалась за
    кожне відображення.
  - `partitionFindings(findings, renderedKeys): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] }`,
    ключовано за `lineKey("RIGHT", f.start_line)` з `comments.ts`. Обґрунтування
    використовує рядки новго-файлу, тому використовується лише `RIGHT`.
  - `worstSeverity(findings): Severity`, використовуючи `SEVERITY_RANK`.
- `client/src/components/diff-viewer/constants.ts`: додайте
  `SEVERITY_RANK = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1, INFO: 0 } as const`. The
  i18n ключ мітки рядка — це `diffViewer.findingLabel.<SEVERITY>`. Важкості без
  ключа (наприклад INFO) відображають смугу, але не мітку.
- `client/src/components/diff-viewer/styles.ts`: додайте `findingDot` (мала крапка,
  `var(--crit)`, близько 7px, `flexShrink: 0`), `findingRail` (та ж індентація як
  `cs.thread`: `margin: "6px 14px 8px 58px"`, стовпець, gap 8), `findingLineLabel`
  (правовирівняна, `marginLeft: "auto"`, 11–12px, колір переданий), і
  `findingStripeFor(color)`, повертаючи `{ boxShadow: \`inset 3px 0 0 ${color}\` }`. Використовуйте
  box-shadow, **не** `borderLeft`, щоб уникнути попередження shorthand/longhand, відзначеного в
  `FindingCard/styles.ts:7-8` та уникнути зміщення ширини витинку. Кольори
  походять від `SEV[sev].c` (`@devdigest/ui`).

**Крок 13: `CodeLine`.** *react-best-practices, design, security*
Файл: `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`. Додайте необов'язкові пропси
`findings?: FindingRecord[]` і `renderFinding?: DiffFindingsApi["renderFinding"]`.
Коли `findings && findings.length > 0`:
- об'єднайте `findingStripeFor(SEV[worst].c)` у стиль рядка
  (`{...lineRowFor(ln.kind), ...stripe}`);
- додайте праву-вирівняну мітку span усередину рядка після `s.lineText` з текстом
  `t(\`diffViewer.findingLabel.${worst}\`)` (тільки коли ключ існує для цієї
  важкості) в `SEV[worst].c`. Використовуйте `useTranslations("shell")`;
- відображайте `<div style={findingRail}>{findings.map(f => <React.Fragment key={f.id}>{renderFinding?.(f)}</React.Fragment>)}</div>`
  безпосередньо під рядком і **перед** потоками коментарів.
Hunk рядки не змінюються. Без знахідок, відображення — байт-для-байтів
поточна поведінка.

**Крок 14: `FileCard`.** *react-best-practices, design*
Файл: `client/src/components/diff-viewer/FileCard/FileCard.tsx`. Додайте необов'язковий
пропс `findings?: DiffFindingsApi`.
- `hasFindings = (findings?.linesByPath.get(file.path)?.length ?? 0) > 0`.
- У заголовку, відразу після шляху `<span>`, коли `hasFindings`, відображайте
  `<span role="img" aria-label={t("diffViewer.hasFindings")} title={…} style={s.findingDot} />`.
  Це відрізняється від значка коментаря `MessageSquare` (рядки 67-74), який
  залишається як є. Шлях span має `flex: 1`, тому перемістіть точку в малий
  інлайн-обгортання з шляхом, або дайте точці `order`, щоб вона сиділа поруч з
  текстом. Розробник вибирає, яка відповідає скріншоту; у будь-якому випадку точка
  сидить одразу після тексту шляху, не далеко праворуч.
- `useMemo`, як коментарій один (рядки 43-49), обчислює
  `{ matched, unanchored } = partitionFindings(findings?.byPath.get(file.path) ?? [], renderedKeys)`
  (повторно використовуйте той же набір `renderedKeys`; перестрактуруйте так, щоб він був
  побудований один раз для обох).
- Передавайте `findings={matchedForLine}` і `renderFinding` кожному `CodeLine`.
  `findingsForLine` — це модульна допоміжна функція поруч з `threadsForLine`, і повинна
  використовувати `keysForLine`, відфільтровану до ключів `RIGHT:`.
- Після рядків, коли `unanchored.length > 0`, відображайте їх у блоці `findingRail`
  (без додаткового заголовка). Це знахідки, чий рядок більше не в
  патчі, наприклад після новочто пушу. Їх показ без заголовка уникає
  тихого приховування знахідки, додаючи жодного нового видимого елемента.
- Стан `open` за файлом і правило `AUTO_EXPAND_MAX_LINES` — **без змін**.

**Крок 15: `DiffViewer` + бочка.** *react-frontend-architecture*
- `DiffViewer.tsx`: додайте необов'язковий `findings?: DiffFindingsApi` і передавайте його до кожного
  `FileCard`. Змініть `key={i}` на `key={f.path}` (шляхи унікальні на PR; правило react-best-practices ключа).
- `diff-viewer/index.ts`: додайте `export { FileCard } from "./FileCard";` і
  `export type { DiffFindingsApi } from "./findings";`.

**Крок 16: Помічники DiffTab.** *react-frontend-architecture, typescript-expert*
Файл: `.../DiffTab/helpers.ts` (нове, чисте, без React):
- `latestReview(reviews: ReviewRecord[] | undefined): ReviewRecord | undefined`
  повертає `reviews?.find(r => r.kind === "review")`. Список вже
  най-новіший-перший (`review.repo.ts:66`). Це дзеркало правила сервера кроку 6; поставте коментар,
  вказуючи на `review.repo.ts` `latestReviewFindingAnchors`.
- `findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]>`.
- `linesByPath(sd: SmartDiffResponse): Map<string, number[]>`.
- `buildViewGroups(files: PrFile[], sd: SmartDiffResponse): ViewGroup[]`, де
  `ViewGroup = { role: SmartDiffRole; files: PrFile[]; findingFiles: number }`.
  Побудуйте `path → role` з `sd.groups`, потім повторіть `files` в їхньому **GitHub
  порядку** та розпорядіться за роллю. Файл, відсутній у відповіді (наприклад
  `pr_files` переписаний між двома отриманнями), йде до `core`, тому файл
  ніколи не приховується від рецензента. Випустіть групи у порядку `sd.groups`,
  вставляючи `core` першим, якщо він був створений лише для залишків. Опустіть групи, які
  скінчилися порожніми. `findingFiles` рахує файли групи, чия довжина `finding_lines`
  більша за 0.

**Крок 17: Компонент `SmartDiffGroups`.** *react-frontend-architecture, react-best-practices, design*
Папка `.../DiffTab/_components/SmartDiffGroups/` (нова):
- `constants.ts`: `DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs","boilerplate"])`,
  плюс `ROLE_TEXT: Record<SmartDiffRole, { label: string; description: string }>`
  тримаючи **ключі** i18n (`"smartDiff.coreLabel"`, `"smartDiff.coreDescription"`,
  та так далі). Цей запис мусить бути вичерпним.
- `styles.ts`: групові розділи та стилі заголовка. Повторно використовуйте мову diff-viewer
  (`var(--border)`, `var(--text-muted)`, ідіому `chevronFor` обертання). Точка
  знахідок-файлів використовує `var(--crit)`.
- `SmartDiffGroups.tsx` (`"use client"`), з пропсами
  `{ groups: ViewGroup[]; commenting?: DiffCommentApi; findings?: DiffFindingsApi }`:
  - стан `collapsed: Set<SmartDiffRole>`, лінивий ініціалізований від
    `DEFAULT_COLLAPSED_ROLES`. Це **групова** згортання тільки й окремо
    від кожного власного стану `open` `FileCard`;
  - для кожної групи, заголовок `<div role="button" tabIndex={0} aria-expanded onClick onKeyDown(Enter/Space)>`
    (те саме a11y як в `ReviewRunAccordion.tsx:71-87`) містячий шеврон,
    **мітку** (жирний), опис (тьмяний, попередньо em dash як у
    скріншоту), flex розділяч, потім
    `{g.findingFiles > 0 && <span aria-label={t("smartDiff.filesWithFindings",{count})}>● {g.findingFiles}</span>}`,
    потім `t("smartDiff.filesCount", { count: g.files.length })`;
  - коли розширено, `g.files.map(f => <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />)`
    всередину стовпця з тим же gap як `s.list`;
  - один малий внутрішній компонент `GroupSection` у тому ж файлі добре. Тримайте
    файл під 200 рядків.
- `index.ts`: `export { SmartDiffGroups } from "./SmartDiffGroups";`.

**Крок 18: `DiffTab`.** *react-frontend-architecture, react-best-practices, design*
Файл: `.../DiffTab/DiffTab.tsx`.
- Нові пропси: `repoFullName?: string | null; headSha?: string | null`.
- Дані: `usePrSmartDiff(prId)`, `usePrReviews(prId)` (ділиться кешований
  запит сторінки), `useFindingAction()`.
- Стан UI: `const [order, setOrder] = useState<"smart" | "original">("smart")`.
- Походять (з `useMemo` де вони відображують масиви):
  `latest = latestReview(reviews)`, і
  `findings: DiffFindingsApi | undefined = smartDiff ? { linesByPath: linesByPath(smartDiff), byPath: findingsByPath(latest?.findings ?? []), renderFinding } : undefined`,
  де `renderFinding = (f) => <FindingCard f={f} defaultExpanded pending={action.isPending} repoFullName={repoFullName} headSha={headSha} onAction={(a) => action.mutate({ findingId: f.id, action: a, prId: prId! })} />`.
  Імпортуйте `FindingCard` з `../FindingCard` (та сама функція). Використовуйте
  `defaultExpanded`, оскільки скріншот показує rationale та Accept/Dismiss
  без кліку. **Не** повторно використовуйте `FindingsPanel`: він встановлює глобальний j/k/a/d
  слухач `keydown` за екземпляром.
- Перемикач: координатор тепер переглянув фактичні скріншоти (раніше
  недоступні для планувальника) — перемикач сидить у своєму власному рядку заголовка, не
  всередину наявного `SectionLabel`. Макет: мала капітель eyebrow мітка
  ("REVIEWER-ORDERED DIFF"-стиль, повторно використовуйте власний eyebrow стиль `SectionLabel`, якщо
  він експортує один, інакше простий тьмяний uppercase span) над рядком з
  статистикою "N files · +A −D" ліворуч і перемикачем праворуч. Сам
  перемикач — це один обмежений сегментований контроль (одна спільна межа, не дві
  окремі кнопки) з двома сегментами, "Smart order" / "Original order", the
  активний сегмент видимо відмінний (жирний/заповнений). Побудуйте його як
  `<div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={s.segmented}>`
  обгортаючи два `Button kind="ghost" size="sm"` (або простий `<button>`s стильований як
  один контроль, вибір розробника) з `active={order === …}`, поміченою
  `t("smartDiff.smartOrder")` / `t("smartDiff.originalOrder")`
  (`useTranslations("prReview")`). Наявна кнопка "Show/Hide comments"
  залишається у своєму поточному правому слоті `SectionLabel`, без змін — два контролі
  на різних рядках у скріншоту.
- Тіло: якщо `order === "smart" && smartDiff`, відображайте
  `<SmartDiffGroups groups={buildViewGroups(files, smartDiff)} commenting={commenting} findings={findings} />`.
  Інакше відображайте `<DiffViewer files={files} commenting={commenting} findings={findings} />`.
  Під час завантаження smart-diff або помилки, плоский вид відображається, тому вкладка
  ніколи не пустує. Точки знахідок та вбудовані картки з'являються в **обох** порядках.

**Крок 19: Проводка сторінки.** *react-frontend-architecture*
Файл: `src/app/repos/[repoId]/pulls/[number]/page.tsx`.
- Рядки 169-176: передавайте `repoFullName={repoFullName}` і `headSha={pr.head_sha}` до `DiffTab`.
- `onRunDone` (рядки 159-165): додайте
  `if (prId) qc.invalidateQueries({ queryKey: queryKeys.prSmartDiff(prId) });`.
  `refetchReviews()` — це рефетч, не інвалідація, тому трюк префікса у кроці 11
  не охоплює цей шлях, і глобальний `staleTime` — 30s
  (`providers.tsx:28`).

**Крок 20: Тести клієнта.** *react-testing-library (з перекриттям INSIGHTS)*
- `src/components/diff-viewer/findings.test.ts`: `partitionFindings`
  (збіг на `RIGHT:n`, не якіровано коли рядка відсутня, дві знахідки на одному
  рядку) та `worstSeverity`.
- `.../DiffTab/helpers.test.ts`: `buildViewGroups` (GitHub порядок тримається за межею
  ролі, файл, відсутній у відповіді, йде до `core`, `findingFiles` рахує файли,
  не знахідки, порожні групи опущені) та `latestReview` (найнеживший `kind:"review"`).
- `.../SmartDiffGroups/SmartDiffGroups.test.tsx`: відображайте групи для всіх 5 ролей.
  Затвердьте порядок заголовка та мітки плюс "N files". Шляхи файлів docs та boilerplate
  не видимі, доки їх заголовок не натиснуто; шляхи core, tests і wiring
  видимі. Точка знахідок-файлів показує кількість файлів, не кількість знахідок.
  Файл з `finding_lines` показує точку "Has findings"; розширення його
  показує ін'єктовану картку під рядком, який число дорівнює `start_line`.
  Надайте `prReview` та `shell` повідомлення через `NextIntlClientProvider`, як в
  `FindingCard.test.tsx:38-44` / `smoke.test.tsx:36-42`.
- `.../DiffTab/DiffTab.test.tsx`: приховайте `@/lib/hooks/reviews` на межі hook
  (`usePrComments`, `useCreatePrComment`, `usePrSmartDiff`,
  `usePrReviews`, `useFindingAction`) і `@/lib/hooks/translation` (як
  `FindingCard.test.tsx:7-10` робить). Потік: груповий вид показує заголовки груп,
  клік "Original order" видаляє заголовки та перелічує файли у заданому
  порядку, і клік "Smart order" відновлює їх. Клік Accept на вбудованій
  знахідці викликає `mutate` з `{ findingId, action: "accept", prId }`. Використовуйте
  `fireEvent` / `src/test/user.ts`.

**Крок 21: Валідуйте** (розділ 8), потім передавайте до Завершення (подальші кроки розділу 9).

## 8. Перевірки прийняття

Запустіть ці з кожної папки пакету. Використовуйте `pnpm <script>`, або
`npx --yes pnpm@10 <script>` якщо `pnpm` не на PATH (root INSIGHTS).

**Синхронізація контракту**
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`
  не друкує нічого.

**server/**
- `pnpm typecheck`
- `pnpm test`. Docker мусить бути запущений, інакше `.it.test.ts` люки пропускаються
  (`describe.skip`). Повідомте, чи дійсно запустився `reviews.it.test.ts`.
- Таблиця класифікатора в `classify.test.ts` мусить включати принаймні ці рядки:

| path | очікувано | чому |
|---|---|---|
| `__tests__/x.snap` | boilerplate | **пріоритет:** snapshot правило перевищує тести `__tests__/**` |
| `.claude/skills/security/SKILL.md` | wiring | **пріоритет:** `.claude/**` перевищує docs `**/*.md` |
| `e2e/README.md` | tests | **пріоритет:** `e2e/**` збігається перед `**/*.md`. Завдання здійснило цей вибір; не переглядайте його |
| `pnpm-lock.yaml` | boilerplate | lock файл |
| `client/pnpm-lock.yaml` | boilerplate | lock файл на глибині |
| `package-lock.json` | boilerplate | lock файл |
| `yarn.lock` | boilerplate | lock файл |
| `Cargo.lock` | boilerplate | `*.lock` |
| `dist/index.js` | boilerplate | `dist/**` перевищує wiring `index.js` |
| `build/app.js` | boilerplate | `build/**` |
| `src/__snapshots__/a.test.ts.snap` | boilerplate | `**/__snapshots__/**` |
| `src/api.generated.ts` | boilerplate | `*.generated.*` |
| `public/vendor.min.js` | boilerplate | `*.min.js` |
| `server/src/x.test.ts` | tests | `*.test.ts` |
| `client/src/A.test.tsx` | tests | `*.test.tsx` |
| `server/test/reviews.it.test.ts` | tests | `*.it.test.ts` |
| `src/a.spec.ts` | tests | `*.spec.ts` |
| `server/test/helpers/pg.ts` | tests | `**/test/**` |
| `src/__tests__/util.ts` | tests | `**/__tests__/**` |
| `e2e/flows/login.ts` | tests | `e2e/**` |
| `server/test/fixtures/README.md` | tests | тести перевищують docs |
| `client/src/components/diff-viewer/index.ts` | wiring | бочка |
| `server/vitest.config.ts` | wiring | `*.config.*` |
| `tsconfig.json` / `server/tsconfig.build.json` | wiring | `tsconfig*.json` |
| `.eslintrc.json` | wiring | `.eslintrc*` |
| `.env.example` | wiring | `.env*` |
| `docker-compose.yml` | wiring | `docker-compose*.yml` |
| `.github/workflows/ci.yml` | wiring | `.github/**` |
| `.claude/hooks/planner-guard.sh` | wiring | `.claude/**` |
| `README.md` | docs | `README*` / `*.md` |
| `server/AGENTS.md` | docs | `**/*.md` |
| `docs/plans/smart-diff_en.md` | docs | `docs/**` |
| `docs/diagram.png` | docs | `docs/**` |
| `CHANGELOG.md` | docs | `CHANGELOG*` |
| `LICENSE` | docs | `LICENSE` |
| `server/src/modules/reviews/service.ts` | core | резервне |
| `client/src/app/page.tsx` | core | резервне |
| `src/index.tsx` | core | лише `index.ts`/`index.js` — бочки |
| `client/dist/a.js` | core | `dist/**` — root-anchored (буквальний спек) |
| `package.json` | core | не в будь-якому правилі (буквальний спек) |

- Ручна перевірка API з запущеним dev сервером (не перезапускайте запущений; root
  INSIGHTS): `curl -s localhost:3001/pulls/<prUuid>/smart-diff | jq` повертає групи
  у порядку core→tests→wiring→docs→boilerplate з лише непорожними групами.
  `curl -s -o /dev/null -w '%{http_code}' localhost:3001/pulls/00000000-0000-0000-0000-000000000000/smart-diff`
  повертає `404`.

**client/**
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`

**Перевірка браузером** (навичка design, порівняна зі скріншотами чату). Використовуйте
PR, чиї файли охоплюють кілька ролей. Навігуйте з `/` і кліцайте; не глибокий-посилання
(client INSIGHTS 2026-09-18).
1. Вкладка Files changed, Smart order: заголовки груп з'являються в порядку Core logic →
   Tests → Wiring → Docs → Boilerplate (лише заповнені), кожен з його
   описом і "N files". Docs і Boilerplate закриті; інші розширені. Файли від 200+ змінених
   рядків всередину розширеної групи ще індивідуально закриті.
2. Lock файл з'являється під Boilerplate.
3. Запустіть Review і чекайте завершення (залишайтеся на вкладці чи поверніться). Заголовки груп
   показують "● k" де k — кількість файлів зі знахідками, без
   перезавантаження сторінки.
4. Ті картки файлів показують просту точку поруч із шляхом, і значок кількості коментарів
   залишається без змін.
5. Розширення такого файлу показує FindingCard (severity, title, rationale,
   Accept/Dismiss) під рядком пронумерованим `start_line`, з кольоровою смугою
   і право-вирівняною міткою `blocker`/`warning`/`suggestion`. Accept чи
   Dismiss оновлює стан картки.
6. "Original order" показує плоский список у порядку GitHub без заголовків груп;
   "Smart order" відновлює групи.
7. Скріншот обидвом теми dark та light, та порівняйте їх зі
   скріншотами.

## 9. Ризики та відкриті питання

**Відкриті питання — вирішені координатором після перегляду скріншотів чату
(планувальник їх не мав):**
- **Q1 (вирішено):** Tests/Docs описи — `"Proves the change works"` /
  `"Explains the change"` — див. крок 10.
- **Q2 (вирішено):** перемикач — це один обмежений сегментований контроль ("Smart
  order" / "Original order") у своєму власному рядку заголовка вище рядка кількості файлів,
  не всередину наявного `SectionLabel` — див. крок 18.

**Рішення, яке має перевірити рецензент** (вирішено з коду, позначено для архітектури та security рецензентів):
- **Домівка модуля — `reviews/smart-diff/`, не новий модуль** (розділ 6 має
  обґрунтування та відхилені опції). Архітектурний рецензент повинен підтвердити
  це проти onion-architecture "не крос-модульний import репозиторія" правила.
- **Latest review — найнеживший рядок `kind='review'` за `created_at`.** Після
  мультиагента "Run all", лише знахідки останньо вставленого агента з'являються у
  diff, що те саме як стовпець знахідок PR списку
  (`pulls/routes.ts:120-131`). Лічильник `findingsCount` заголовка сторінки рахує
  знахідки крім *усіх* перевірок, тому diff може показати менше знахідок ніж
  заголовок. Це навмисно, для узгодження зі списком PR. Зв'язки на
  `created_at` не мають тайбрейкера, знову ж дзеркалюючи список.
- **Два джерела даних, одне правило.** Точки та кількість груп походять від сервера
  `finding_lines`. Вбудовані картки походять від клієнтського `usePrReviews` зменшеного
  `latestReview()`. Вони ділять правило, але не запис кешу, тому вони можуть коротко
  не погодитися прямо після запуску, доки обидва не рефетчать. Крок 19 плюс префікс ключа у
  кроці 11 тримають це вікно коротким.
- **Буквальна семантика glob.** `dist/**`, `build/**`, `docs/**`, `e2e/**`,
  `.github/**`, `.claude/**` — root-anchored, тому `client/dist/x.js` — core.
  `package.json`, файли `*.yaml` CI поза `.github/`, та `next.config.mjs`
  (який — wiring через `*.config.*`) дотримуються спеку точно. Збіг чутливий
  до регістру (`readme.md` все ще docs через `*.md`; `Readme` без
  розширення — core).
- **Не якіровані знахідки** (рядок більше не у патчі після нового push)
  відображаються внизу тіла файлу без заголовка, замість того щоб бути
  опущені. Це малий візуальний додаток в граничному випадку. Дизайн-рецензент
  може обрати інший підхід.
- **`pr_files` переписується non-transactionally** від `GET /pulls/:id`
  (`pulls/routes.ts:231-242`). Конкурентне читання smart-diff може побачити часткову
  список. `buildViewGroups` поміщає такі файли в `core` замість приховування їх.
- Безпека: новий маршрут — read-only і область видимості робочої зони через
  `getContext` + `getPull(workspaceId, prId)`, і `:id` uuid-перевірено. The
  класифікатор робить лише порівняння рядків (не RegExp від даних). Текст знахідок
  відображається через наявний `FindingCard`/`Markdown`. Безпека-рецензент
  повинна підтвердити, що нічого нового не експонується.
- Закриття групи вивільняє свої `FileCard`s, тому на повторне розширення кожне
  стан `open` файлу скидається до резервного `AUTO_EXPAND_MAX_LINES`. Це прийнятно і
  називається так, щоб ніхто не "виправляв" це, об'єднуючи два стани закриття.

**Подальші кроки плану (Завершення; для координатора, не розробника):**
- Конвеєр — планувальник → розробник → (архітектурний рецензент ∥
  plan-verifier). Опис PR мусить резюмувати, який subagent зробив що та
  що plan-verifier знайшов.
- Комітти на гілці `L03-homework` з префіксом `L03-homework: `, з окремими
  `git add` / `git commit` викликами. Розробник не створює комітти якщо не
  сказано.
- Кандидати записів INSIGHTS при Завершенні (лише якщо вони утримувалися):
  `server/INSIGHTS.md`: smart-diff "latest review" навмисно повторно використовує
  правило PR-list. `client/INSIGHTS.md`: вкладення `prSmartDiff` під
  ключем префіксом `["reviews", prId]` робить наявні інвалідації його охоплюючими, але
  `refetch()` не.

## 10. Не вдалося визначити

- **Самі скріншоти.** Я мав лише текстовий опис координатора:
  точний розмір, розмір шрифту, розташування перемикача, розміри точок, та чи
  опис групи сидить на тому ж рядку як мітка. `design/` HTML
  — бандл без grep-здатних рядків Smart Diff, і я не відкривав його в
  браузері (read-only планування).
- **Чи `SmartDiffResponse` експортується з `@devdigest/shared`'s
  `index.ts`** в обидвох копіях. Я бачив коментар боченки, перелічуючи
  `contracts/brief` і припускаю, що `review-api` також експортується (клієнт вже
  імпортує `ReviewRecord` з `@devdigest/shared`). Крок 1 має розробника
  підтвердити це з grep.
- **`Button` a11y пропси.** Я не читав `vendor/ui` `Button` щоб побачити чи він
  перенаправляє `aria-pressed`. План покладається на `active` плюс
  `role="group"` обгортання замість.
- **Чи `reviews.it.test.ts` може запуститися** на машині розробника (Docker
  необхідний). Без Docker, випадки інтеграції кроку 9 мовчки пропускаються,
  та розробник мусить це сказати.
