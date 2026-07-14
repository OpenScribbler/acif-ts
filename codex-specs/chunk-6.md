# acif-ts — chunk 6: pack id derivation/resolution

Continuation of the clean-room ACIF TypeScript implementation. Existing
modules: `src/canonical.ts`, `src/body_hash.ts`, `src/envelope.ts`,
`src/metadata_hash.ts`, `src/requires.ts`. `spec-inputs/` remains the only
allowed source of semantics and is read-only.

## Deliverable

`src/pack_id.ts` implementing the pack model of
`spec-inputs/specs/publisher-spec/spec.md` as it binds implementations:

- The Pack Inference Algorithm v0.1 of §9, complete and exact: canonical
  source precedence (§9.1, incl. the conflict signal), canonical display name
  (§9.2), canonical repository URL normalization (§9.3), `inferred_pack_id`
  derivation (§9.4 — implement UUIDv5 with node/bun built-in crypto; no npm
  deps), canonical address (§9.5), and inference version (§9.6).
- The pack-membership predicate of §8.3.
- Any named error identifiers the publisher spec §10 mints for this area,
  carried with the established rejection conventions (exact id string +
  params).

Structural guidance: inputs are in-memory values (manifest map / parsed
records / URL strings) — no filesystem or network. Keep §9.3's warning in
mind: this module's URL normalization is scoped to pack inference; do not
export it as a general-purpose URI normalizer.

## Tests

`test/pack_id.test.ts` (Vitest):

- Cover every vector in `spec-inputs/conformance/vectors/` whose expectations
  involve pack inference, `inferred_pack_id`, canonical address, pack
  membership, or pack-source conflict — TV-3 in `core.yaml` at minimum; scan
  the other vector files. Cite vector ids in test names; transcribe
  inputs/expects verbatim.
- Unit tests per §9.1–§9.6 clause (precedence order, fall-through on
  absent/empty name, scp-form rewrite, lowercasing scope, owner extraction
  per host family) and for the §8.3 predicate.

## Verify

`bun run typecheck` and `bun run test` all green (all chunks). Report which
spec clauses drove each decision and which vectors are covered.
