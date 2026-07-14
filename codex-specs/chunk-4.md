# acif-ts — chunk 4: metadata_hash

Continuation of the clean-room ACIF TypeScript implementation. Existing
modules: `src/canonical.ts` (canonical JSON, core §8.6), `src/body_hash.ts`
(core §7), `src/envelope.ts` (core §5). `spec-inputs/` remains the only
allowed source of semantics and is read-only.

## Deliverable

`src/metadata_hash.ts` implementing `metadata_hash` exactly as specified in
`spec-inputs/specs/publisher-spec/spec.md` §6, together with the
presence/absence rules of §5.2 and the pack-record rules of §8.2 as far as
they govern when a `metadata_hash` exists. Read §5 (two-section record) and
§6 fully; core §7.8 and §8.6 give the coverage and serialization background.

Structural guidance (semantics come from the spec):

- Input: a `publisher_section` value (parsed object). Output: the
  `{algorithm, value}` pair per §6. Reuse `canonicalJson`/`canonicalJsonBytes`
  and the sha256 helper already exported by `src/body_hash.ts`.
- Follow the §6 preimage framing byte-for-byte as written.
- Export a presence predicate or helper capturing the §5.2/§6/§8.2 rule for
  when a record must / must not carry `metadata_hash` (declared vs inferred
  pack records included), returning or throwing per the published error
  identifiers if the publisher spec §10 mints any for this area.

## Tests

`test/metadata_hash.test.ts` (Vitest):

- Cover every vector in `spec-inputs/conformance/vectors/` whose expectations
  pin a `metadata_hash` value or metadata-hash presence behavior reachable
  with an in-memory `publisher_section` — TV-2 and TV-9 in `core.yaml` at
  minimum; scan the other vector files for metadata_hash expectations. Cite
  vector ids in test names; transcribe inputs/expects verbatim.
- Unit tests for the presence/absence rules (§5.2, §8.2).

## Verify

`bun run typecheck` and `bun run test` all green (all chunks). Report which
spec clauses drove each decision and which vectors are covered.
