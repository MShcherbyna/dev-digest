---
name: onion-architecture
description: Enforces Onion Architecture (dependency rule, ports/adapters, thin routes, repositories returning domain types) for new and changed backend modules in server/src/modules. Use when creating or refactoring a module, adding a service, repository, port or adapter, wiring the DI container, writing Fastify routes, Drizzle queries or Zod schemas on the backend, or reviewing layer dependencies. Backend only; for React/Next.js use react-frontend-architecture.
---

# Onion Architecture (backend, `server/`)

Target-state rules for **new and touched modules**. Do not rewrite untouched modules just to comply; when you edit an existing module, move it toward these rules only as far as the change requires.

We use a **lightweight** variant: keep `routes.ts → service.ts → repository.ts`, add `ports.ts` (and `domain/` only when a module has real business rules). Simple CRUD modules (`workspace`, `polling`) need just ports + no leaked DB rows.

## The Dependency Rule

Code may depend on layers more central, never on layers further out **[S1]**. Domain and application code must compile and run without Fastify, Drizzle, Postgres or any SDK.

| Layer (center → edge) | Lives in | May import |
|---|---|---|
| Domain: entities, value objects, pure rules | `modules/<x>/domain/` (optional), `@devdigest/shared` types | nothing but TS |
| Application: use cases + ports | `service.ts`, `ports.ts` | Domain |
| Infrastructure: repositories, adapters | `repository.ts`, `src/adapters/**` | Domain, Application (ports) |
| Presentation | `routes.ts`, Zod request/response schemas | Application |
| Composition root | `platform/container.ts`, `app.ts` | everything |

Ports (interfaces such as `RepoStore`, `GitClient`) are defined in the **application** layer; infrastructure implements them. Repository interfaces are persistence abstractions, so they belong in application, not domain **[S3]**.

## Rules per tool

**Fastify** (see also `fastify-best-practices`)
- A route only parses input, calls one service method, maps status codes. No SQL, no SDK calls, no business rules.
- Each module is an encapsulated plugin **[S12]**. Share dependencies via `app.container` / `decorate` at the root scope, never module-level singletons.
- Domain errors are thrown by services and mapped to HTTP in one error handler, not per route.

**Zod** (see also `zod`)
- Request/response schemas live at the edge (routes, `shared`). Validate on the way in; services receive already-parsed typed input.
- Domain code does not import `zod`.

**Drizzle** (see also `drizzle-orm-patterns`)
- `t.*` tables, `$inferSelect`/`$inferInsert` and `drizzle-orm` imports stay inside `repository.ts`.
- A repository implements a port and returns **domain/shared types via a mapper**, never raw rows **[S16, S17]**.
- Transactions **[S15]**: accept an optional `tx` parameter (or a transaction-manager port) so a use case can span repositories atomically. Services never touch `db`.
- Keep explicit snake_case column names (repo convention).

**Adapters (Octokit, OpenAI/Anthropic, simple-git, ripgrep, ast-grep)**
- SDK types never leave the adapter. Expose only our interfaces from `@devdigest/shared`.
- New external dependency = new port + adapter + entry in `src/adapters/mocks.ts`.

**DI / Container**
- Services take **narrow ports via constructor** (`{ store: RepoStore, git: GitClient, jobs: JobPort }`), not the whole `Container`, and do not `new` their repositories.
- Only the composition root instantiates concrete classes.

**Jobs / SSE**
- Job handlers are application-level (they call services). SSE transport is infrastructure.

**Modules**
- A module does not import another module's `constants`, `helpers` or `repository`. Cross-module needs go through a port exposed from the composition root or a module `index.ts` facade.

**Tests**
- Domain/application: unit tests (`*.test.ts`) with in-memory fake ports.
- Infrastructure: `*.it.test.ts` with Testcontainers.

## Review checklist

1. Any `fastify`, `drizzle-orm`, `postgres`, `octokit`, `openai`, `@anthropic-ai/sdk` import in `service.ts`, `ports.ts` or `domain/`?
2. Does `service.ts` import `Container` or `new` a repository/adapter?
3. Does a repository method return `$inferSelect` rows or SDK types?
4. Does a route contain SQL, SDK calls or branching business rules?
5. Are ports declared in the application layer and implemented outward?
6. Does the module reach into another module's internals?
7. Can the service be unit-tested with fakes and no DB?
8. Are secrets accessed only via `SecretsProvider`?
9. Are new adapters registered in the container and in `mocks.ts`?
10. Did you leave `vendor/shared`, migrations and lockfiles untouched?

## Do not

- Collapse `routes/service/repository` into one file.
- Add a `domain/` folder to a module with no business rules just for symmetry.
- Hand-edit `src/vendor/shared/**` or `src/db/migrations/**`.

See [examples.md](examples.md) for good/bad code and [README.md](README.md) for the source registry (S#).
