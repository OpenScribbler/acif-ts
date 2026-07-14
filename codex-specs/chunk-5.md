# acif-ts — chunk 5: requires evaluation

Continuation of the clean-room ACIF TypeScript implementation. Existing
modules: `src/canonical.ts`, `src/body_hash.ts`, `src/envelope.ts`,
`src/metadata_hash.ts`. `spec-inputs/` remains the only allowed source of
semantics and is read-only.

## Deliverable

`src/requires.ts` implementing the capability model of
`spec-inputs/specs/core/spec.md` §9 as it binds implementations:

- The recognized `requires` vocabulary per content type (each L1 spec under
  `spec-inputs/specs/` defines its own — read them; core §9.1 states the ACIF
  0.1 ground truth).
- Canonical normalization of the `requires` slot (§9.1 empty/absent rule) —
  expose a helper other modules and the CLI can reuse.
- Orphan-key reject per §9.4: exact identifier `acif.requires.orphan_key`
  with the offending key in a `key` param, uniform over all causes. Reuse the
  established error/rejection conventions from earlier modules.
- Three-valued consumer evaluation per §9.5: evaluating a `requires` map
  yields per-key `satisfied | unsatisfied | unknown` and an overall result;
  unknown is distinct from both and never silently coerced. Include the
  refuse-unless-opted-in decision helper §9.5 describes for install tools.

Keep the module scoped to §9 — cross-content-type reference states (§10) are
registry/consumer compute and not part of this chunk.

## Tests

`test/requires.test.ts` (Vitest):

- Cover every vector in `spec-inputs/conformance/vectors/` whose expectations
  involve `requires` handling (orphan-key verdicts, empty-normalization
  effects) reachable with in-memory inputs — scan `core.yaml` and all
  per-type files. Cite vector ids in test names; transcribe inputs/expects
  verbatim.
- Unit tests: §9.1 empty/absent one-state rule, §9.4 uniform reject with
  `key` param, §9.5 three-valued evaluation incl. the opt-in path.

## Verify

`bun run typecheck` and `bun run test` all green (all chunks). Report which
spec clauses drove each decision and which vectors are covered.
