# Крос-рев'ю плану `pr-brief_en.md` проти специфікації `2026-10-12-pr-brief.md`

Рев'юер: незалежний (не автор плану). Перевірено: 42 AC, реальний код
(`server/`, `client/`, `e2e/`, `.claude/hooks`). Нічого в плані/специфікації/коді не змінено.

Загальна оцінка: план у цілому точний щодо існуючого коду (усі згадані файли,
функції, ключі, порти, `classifyFile`, `usedByRows`, `wrapUntrusted`,
`estimateTokens`, `resolveFeatureModel`, `MockLLMProvider.structuredBySchema`,
`prBrief`-таблиця, `client/src/lib/types.ts:83`, іконки `Boxes/Shield/Zap/...`
існують). Покриття AC майже повне. Нижче лише перевірені розбіжності.

## Знахідки

### F-1 (major) AC-32: rate limit не діє в `.it`-тестах, тест «11-й POST -> 429» не може пройти

- Evidence: `server/src/app.ts:93-97` -
  `if (config.nodeEnv !== 'test') { await app.register(rateLimit, { max: 120, ... }) }`
  (коментар: "Disabled under test so integration suites can hammer endpoints").
  Усі `.it`-сюїти будують `loadConfig({ ...process.env, NODE_ENV: 'test' })`
  (напр. `server/test/onboarding.it.test.ts:133`, `blast.it.test.ts:12`).
  Per-route `config: { rateLimit: { max: 10, ... } }` без зареєстрованого плагіна
  є no-op. У плані: S8 (рядки 639-641) і T1 (рядок 994: "AC-32: the 11th POST in a
  minute gives 429, and calls <= 10"). `server/src/app.ts` відсутній у розділі 3
  "Affected modules".
- Чому важливо: AC-32 верифікується саме інтеграційним тестом; як написано, він
  завжди дасть 200 на 11-й запит (або план мовчки зламається на кроці T1).
- Правка плану: додати рішення в S8/розділ 3. Варіанти: (a) у `app.ts` завжди
  реєструвати плагін, у test-режимі з `global: false` (тоді діють лише per-route
  ліміти) - файл додати до Affected modules; (b) brief.it будує app з
  `nodeEnv: 'development'` для AC-32 (і явно це зазначити в T1). Обрати одне і
  описати.

### F-2 (major) NFR «<= 12 000 вхідних токенів» не гарантується дизайном; сумарного бюджету немає

- Evidence: план S9 (рядки 651-664) і AC-7 дозволяють до 8 000 токенів
  документів; S1 (рядки 453-455) лише "e.g." для решти:
  `MAX_FINDINGS_SENT = 50`, `MAX_DESCRIPTION_CHARS = 6000` (~1 500 ток.),
  `MAX_HUNKS_PER_FILE = 20`, до 200 файлів по рядку
  `path | +a -d | role | hunks: s-e, ...` (S5, рядок 545) - це легко 5-8k токенів
  лише для `changed-files`. Сума 8 000 + опис + інтент + blast + файли + findings
  перевищує 12 000. Розділ 9 (рядки 1114-1116) лише каже "verify against the log
  line". Спека (NFR): "<= 12,000 input tokens per generation, of which spec
  documents <= 8,000".
- Правка плану: ввести загальний бюджет у `helpers.ts`/`service.ts` (напр.
  `INPUT_BUDGET_TOKENS = 12_000`; спершу фіксований розмір решти фактів через
  `estimateTokens`, бюджет документів = `min(8_000, 12_000 - rest)`; обрізання
  списку файлів/hunk-діапазонів за токенами, а не лише за кількістю). Додати
  unit-тест: фікстура 200 файлів + 8k документів дає промпт <= 12 000 за
  `estimateTokens`. Зафіксувати конкретні значення констант замість "e.g.".

### F-3 (minor) AC-6: немає автоматичного тесту «PrBrief з intent:null/blast:null парситься»

- Evidence: AC-6 Verify вимагає unit: дві копії байт-ідентичні та бриф з
  `intent: null`, `blast: null`, summary і двома focus-елементами парситься.
  План покриває лише `diff` у кроці 0 (рядки 436-441) і розділ 8; у T1
  (рядки 953-994) такого тесту немає.
- Правка: додати кейс у `server/test/contracts.test.ts` (існує) або в
  `brief-helpers.test.ts`: `PrBrief.parse` з nullable-полями + негатив
  (`review_focus[].line = 0` відхиляється). Байт-ідентичність лишити як `diff` у C-final.

### F-4 (minor) AC-24 та `generating` у GET не мають інтеграційного verify

- Evidence: AC-24 Verify: "integration - each cause gives its code and an
  unchanged stored brief". У T1 `brief.it.test.ts` (рядки 984-994) коди
  `missing_api_key` (500) / `provider_error` / `invalid_output` (502) перевіряються
  лише у `brief-service.test.ts` (fake-порти), тобто HTTP-статуси й envelope
  `{ error: { code } }` не тестуються. Також AC-23 Verify "GET flag
  `generating: true`" на сервері не покритий в it (є лише "200 + 409").
- Правка: додати в `brief.it.test.ts` по кейсу на кожну причину (mock llm без
  ключа через override secrets / throw / invalid JSON) з перевіркою статусу, code і
  незмінного рядка `pr_brief`; та GET під час gated-генерації -> `generating: true`.

### F-5 (minor) Порядок кроків: typecheck ламається між C8/C9 і C10

- Evidence: C9 (рядки 845-847) передає `target={...}` у `DiffTab`, а проп
  `target` з'являється лише в C10 (рядки 855-860); C8 додає обов'язкові
  `diffPaths`/`onOpenFile` в `OverviewTab` раніше, ніж C9 їх передає. Розділ 12
  (рядки 1219-1220): "C8 and C9 depend on C7; C10 depends on C9". Єдина
  перевірка типів - C11 (і S10 для сервера), тож проміжні стани не компілюються.
- Правка: переставити C10 перед C9 (або зробити нові props optional у C8/C10 до
  підключення в C9), або об'єднати C8-C10 в один крок з єдиним typecheck.
  Крок 0 достатній для типів `PrBrief` (єдиний споживач -
  `client/src/lib/types.ts:83`, type-only; перевірено).

### F-6 (minor) AC-40: плейсхолдер Risk areas дублюється з чипами Intent-картки

- Evidence: C6 (рядки 755-759) - `BriefSkeleton` має три плейсхолдери (banner,
  risk areas, focus) як окремий блок; C7 (рядки 811-813) - у `firstGeneration`
  `IntentCard` рендериться без `riskAreas`, тож показує власні chips "RISK AREAS".
  Спека AC-40: скелетони "in place of the banner, the Risk areas section and the
  Review focus card", а Risk areas - секція всередині Intent-картки (AC-13).
- Правка: у `firstGeneration` передавати в `IntentCard` `riskAreas={<RiskAreasSkeleton/>}`
  (слот прихованих chips), а `BriefSkeleton` лишити для banner і focus; тест AC-40
  перевіряє, що чипів інтенту в цей момент немає.

### F-7 (minor) Seed-бриф суперечить власним hunk-діапазонам

- Evidence: F1 (рядки 896-913): `ratelimit.ts` hunk покриває 24-55, але
  ризик "Auth surface touched" має ref `src/middleware/ratelimit.ts:12-18` -
  поза hunk, тобто такий ref реальний grounding (AC-19) звів би до `path`.
  Сід це обходить (не проходить grounding), але e2e/скріншот-перевірка і
  AC-21-приклад ("line 12") спираються на нереалістичні дані. Також
  `files_total: 5` при `pull_requests.filesCount: 9` у сіді
  (`server/src/db/seed.ts:190`). `StoredBrief.parse` у `db/seed.ts` -
  імпорт з `modules/brief/schemas` (інфра->application напрямок; прийнятно для
  dev-сіду, але варто зазначити).
- Правка: розширити hunk `ratelimit.ts` до 10-60 (або змінити ref на 24-30),
  узгодити `files_total`/`filesCount`.

### F-8 (minor) Дубль флоу в `e2e/specs/` не оновлюється

- Evidence: `git ls-files e2e` показує трекований `e2e/specs/04-pr-findings.flow.json`
  (ідентичний `specs_old/04...`, містить `"2 findings"`); `e2e/run.ts:36` читає лише
  `specs_old`. План F2 (рядок 924) змінює тільки `specs_old`; §9 радить
  `grep "2 findings"`, що знайде й дубль, але кроку для нього немає.
- Правка: у F2 вказати, що `e2e/specs/04-*.flow.json` оновлюється теж (або
  явно зазначити, що це мертва копія й її не чіпають).

### F-9 (minor) AC-26: навігація (`router.push`, Back, прямий URL, `setTab`) не має гарантованого verify

- Evidence: F3 крок 5 (рядки 937-941) - перевірка фокусу/`back` умовна ("if the
  installed agent-browser supports it"), інакше "covered by unit tests (C10, T2)", але
  T2 (рядки 996-1036) не містить тесту для `page.tsx`: ні `router.push` проти
  `replace`, ні очищення `file`/`line` в `setTab`, ні відкриття з прямого URL.
  Код: `page.tsx` `setParam` використовує `router.replace` (рядок ~78 файлу), зміна -
  новий behaviour у tab switcher.
- Правка: додати тест page-рівня (мок `useRouter`/`useSearchParams`) для: push з
  `tab=diff&file=&line=`, `setTab` видаляє `file/line`, парсинг `line` (не число
  -> null).

## Перевірено без зауважень

- Vendored `brief.ts` (обидві копії ідентичні зараз; `diff` порожній), блок
  `PrBrief` у плані відповідає AC-6; `index.ts` вже реекспортує. Крок 0 вручну
  основною сесією коректний: `.claude/hooks/implementer-guard.sh` блокує Edit/Write
  по `/vendor/shared/`.
- Таблиця `pr_brief` (`server/src/db/schema/reviews.ts:108`), міграції не потрібні;
  `prFiles.patch` існує; `GET /pulls/:id` перезаписує `pr_files` лише коли
  є GitHub-токен (інакше fallback на seed) - сумісно з e2e hermetic.
- Onion: порти без infra-імпортів, `classifyFile` лише в `container.ts`,
  singleton `BriefService` - узгоджено з `onboarding`/`intent`.
- Grounding (AC-8/36/37/19), 409/in-flight з токеном, стале за `head_sha`,
  nullable intent/blast, 404 до LLM, plain-text рендер, відсутність diff-коду в
  промпті, логи без промпту - відповідають спеці. `doc path` валідований
  `validateDocPath` (нема лапок), тож `wrapUntrusted(label)` безпечний.
- Seed лише в `if (!pr)` (`seed.ts:175`) - обмеження задокументоване; `pr_brief`
  окремим `onConflictDoNothing`. Flow 04 = єдиний e2e, що залежить від кількості
  findings; серверні тести кількості seed-findings не перевіряють.
- Матриця AC -> крок -> тест: AC-1..42 усі мають крок; неповний verify лише у
  F-3, F-4, F-9 вище.
