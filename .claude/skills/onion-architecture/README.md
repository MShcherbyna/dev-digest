# onion-architecture — sources

Source registry for [SKILL.md](SKILL.md). Rules in SKILL.md cite these as **[S#]**.
Status: **Read** = full page fetched and rules extracted (2026-09-19); **Snippet** = only seen in
search results, verify before relying on it.

## A. Onion Architecture (origin and explanations)

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S1 | Jeffrey Palermo — The Onion Architecture, part 1 | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ | Dependency Rule ("code can depend on layers more central, never further out"); database and UI are external; repository interfaces in the core, implementations at the edge | Read |
| S2 | Jeffrey Palermo — The Onion Architecture, part 2 | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/ | Follow-up on layers | Snippet |
| S3 | Herberto Graça — Onion Architecture | https://herbertograca.com/2017/09/21/onion-architecture/ | Layers (domain model, domain services, application services, infrastructure); interfaces defined inward, implemented outward; repository interfaces belong to the application layer; core runs without infrastructure | Read |
| S4 | Herberto Graça — Onion Architecture (Medium) | https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85 | Same article, cross-check for S3 | Snippet |
| S5 | CodeGuru — Understanding Onion Architecture | https://www.codeguru.com/csharp/understanding-onion-architecture/ | Overview | Snippet |

## B. TypeScript / Node.js

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S6 | André Bazaglia — Clean architecture with TypeScript: DDD, Onion | https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/ | TS layout for Onion + DDD | Snippet |
| S7 | Wolk Software — SOLID and Onion in Node.js with TypeScript and InversifyJS | http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs | Depend on abstractions, not concretions | Snippet |
| S8 | Sankhadip Samanta — Onion Architecture in Node.js with TypeScript | https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391 | Controller/service/repository/domain/DTO split | Snippet |
| S9 | Melzar/onion-architecture-boilerplate | https://github.com/Melzar/onion-architecture-boilerplate | Reference folder structure | Snippet |
| S10 | Dependency inversion with Node.js, TypeScript and tsyringe | https://hofstede-matheus.medium.com/achieve-dependency-inversion-with-nodejs-typescript-and-tsyringe-8b956bc3254c | DI is one way to reach dependency inversion | Snippet |
| S11 | Hexagonal Architecture and Clean Architecture (with examples) | https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi | Ports/adapters vs layers | Snippet |

## C. Fastify

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S12 | Fastify — The hitchhiker's guide to plugins | https://fastify.dev/docs/latest/Guides/Plugins-Guide/ | Encapsulation per `register`; `decorate` for shared dependencies; declare shared utilities in root scope | Read |
| S13 | Snyk — Fastify plugins as building blocks | https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/ | Plugins as a light DI mechanism, explicit boundaries | Snippet |
| S14 | fastify/help#284 — DI best practice | https://github.com/fastify/help/issues/284 | Community discussion on DI in Fastify | Snippet |

## D. Drizzle / Repository pattern

| # | Source | URL | What we took | Status |
|---|---|---|---|---|
| S15 | Sentry — Atomic Repositories in Clean Architecture and TypeScript | https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/ | Interfaces in the app layer without DB imports; Drizzle implementations in infrastructure; optional `tx` passed from use case to repository | Read |
| S16 | Khalil Stemmler — DTOs, Mappers & the Repository Pattern | https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/ | Repositories return domain entities; mappers convert to/from persistence and DTOs | Snippet |
| S17 | Paul Serban — Drizzle ORM Best Practices | https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/ | Separate DB types from domain types | Snippet |
| S18 | Repository Pattern in Nest.js with Drizzle ORM | https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae | Repository over Drizzle | Snippet |
| S19 | Transactions with DDD and Repository Pattern in TypeScript | https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901 | Transaction handling across repositories | Snippet |
| S20 | Drizzle ORM | https://orm.drizzle.team/ | Official docs (`transaction()`) | Snippet |

## Related in-repo skills

`fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `postgresql-table-design`,
`typescript-expert`, `security`.

## Files

- [SKILL.md](SKILL.md) — rules and review checklist
- [examples.md](examples.md) — good/bad code on the `repos` module
