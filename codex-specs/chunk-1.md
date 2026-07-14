# acif-ts — chunk 1: repo scaffold + canonical JSON serializer

You are building `acif-ts`, a clean-room TypeScript implementation of the ACIF
(Agent Content Interchange Format) core specification. The only allowed source
of semantics is the `spec-inputs/` directory in this repo (published spec text
and conformance vectors). Treat `spec-inputs/` as read-only reference material —
never modify it.

This chunk delivers the project scaffold and the canonical JSON serializer.
Later chunks will add body_hash, envelope validation, metadata_hash, requires
evaluation, pack id derivation, a CLI, and an NDJSON adapter — do not implement
those now.

## Scaffold

- Runtime: bun. `package.json` with `"type": "module"`, `"private": true`,
  name `acif-ts`.
- Zero runtime dependencies. Dev dependencies only: `typescript`, `vitest`
  (add `bun-types` or `@types/bun` if needed for editor types).
- `tsconfig.json` with `"strict": true` (plus sensible modern module settings
  for bun + ESM).
- Scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- `.gitignore`: `node_modules/`, coverage output.
- Layout: source in `src/`, tests in `test/`.

## Canonical JSON serializer

- File: `src/canonical.ts`.
- Export a function `canonicalJson(value: unknown): string` (and, if useful, a
  bytes variant returning `Uint8Array`) that serializes a value to canonical
  JSON exactly as specified in `spec-inputs/specs/core/spec.md` §8.6
  ("Canonical JSON serialization"). Read that section carefully and implement
  precisely what it requires — including every constraint it states about
  ordering, whitespace, encoding, and any value-domain restrictions. If the
  section rejects certain inputs, throw a descriptive `Error`.
- Do not add behavior the spec does not require.

## Tests

- `test/canonical.test.ts` using Vitest.
- Derive test cases from the normative statements of §8.6 — one or more tests
  per stated constraint. Where files under `spec-inputs/conformance/vectors/`
  contain canonical-JSON-relevant expectations, you may use those too. Do not
  invent semantics beyond the published text.

## Verify

Run `bun install`, then `bun run typecheck` and `bun run test`. All green
before you finish. Report what §8.6 required and how each requirement maps to
a test.
