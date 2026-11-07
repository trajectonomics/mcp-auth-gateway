# Coding Standards

Read at **review** time. `bun run check` already enforces the mechanical rules (formatting, strict
types, tests, build, package shape). This file covers what it cannot: the conventions a reviewer
must check by reading the diff.

Decisions behind the API live in `docs/adr/`; vocabulary lives in `GLOSSARY.md`.

## Public API

- A new exported function or type carries a one-line JSDoc saying what it **is**, not how it works.
- Values returned by constructors or domain factories are frozen. A caller-supplied object is never mutated.
- A rule that can reject input gets its own domain error code enum/union. One code per rule: never widen an existing code's meaning, and never let two distinct rules share one.
- A thrown error's `field` mirrors the caller's input path, never an internal variable name.

## Purity

- For core domain logic: no clock, randomness, `Date`, `fetch`, `process`, `Math.random`, or unseeded ID generation. IDs and dates arrive as arguments.
- Closed world: avoid leaky callbacks, untyped config bags, or runtime hooks unless explicitly required by an adapter boundary.
- Real-world cases that do not fit are addressed by new core primitives, not vague extension points.

## Naming and Domain Language

- Use `GLOSSARY.md` vocabulary strictly. Synonyms in a diff are considered defects.
- When an API requires a unit or duration, make the unit explicit in the type and parameter name (e.g. `timeoutMs`, `cents`).

## Tests

- One test per error condition, asserting `error.code` rather than merely that something threw.
- A test name states the domain rule or invariant, not the internal function under test.
- Property tests and parameterized tests are used for invariants that must hold across all valid inputs.

## Files

- One concern per file. The 100-line ceiling (200 for test files) is enforced by Biome. Split files as soon as multiple concerns arise.
- `index.ts` remains a clean re-export list defining the package's public surface. `src/index.surface.test.ts` pins the runtime exports; update it deliberately when the public API changes.

## Where things live

Reuse these modules instead of re-implementing them per feature.

- Shared JSON record narrowing: `src/is-record.ts`.
- Shared issuer, resource, Upstream, and Token File defaults: `src/defaults.ts`.
- Pure token logic: `src/token-file.ts` and `src/token-state.ts`; adapters pass `nowMs` from their boundary.
- Container contract: `Dockerfile` and `docker-compose.yml`; CI builds and smoke-tests them.
