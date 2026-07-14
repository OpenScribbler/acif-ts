# acif-ts — chunk 3: envelope validation

Continuation of the clean-room ACIF TypeScript implementation. Existing
modules: `src/canonical.ts` (canonical JSON, core §8.6), `src/body_hash.ts`
(core §7). `spec-inputs/` remains the only allowed source of semantics and is
read-only.

## Deliverable

`src/envelope.ts` implementing validation of the ACIF common envelope exactly
as specified in `spec-inputs/specs/core/spec.md` §5 (fields §5.1, forbidden
fields §5.2), with the named reject conditions from the §8.7 diagnostics table
(`acif.envelope.kind_invalid`, `acif.envelope.id_invalid`,
`acif.envelope.version_invalid`, `acif.envelope.license_spdx_invalid`,
`acif.envelope.forbidden_field`). Where §5 defers to other specs in
`spec-inputs/specs/` (e.g. publisher-spec for record shapes), follow those
references.

Structural guidance (semantics come from the spec):

- Input: a parsed record object (`unknown`). Output: a typed result — either a
  validated envelope or a list of rejections carrying the exact stable
  identifier strings plus any params the §8.7 table defines (e.g. `field` for
  forbidden_field). Collect all rejections rather than stopping at the first,
  unless the spec text requires otherwise.
- Reuse the error/identifier conventions established in `src/body_hash.ts`
  (stable id on the error/rejection object).
- Implement exactly the checks the spec assigns to the envelope layer — do not
  absorb requires-evaluation (§9, later chunk) or pack id derivation (later
  chunk).
- UUID and SemVer validation per the spec's cited standards; implement the
  checks directly (no npm deps).

## Tests

`test/envelope.test.ts` (Vitest):

- Cover every vector in `spec-inputs/conformance/vectors/` whose expectations
  are envelope-validation verdicts this module can reproduce (scan `core.yaml`
  and the per-type files for envelope reject/accept cases — e.g. kind, id,
  version, license.spdx, forbidden-field vectors). Cite vector ids in test
  names; transcribe inputs/expects verbatim (no YAML dependency).
- Unit tests for each named reject identifier, accept paths included.

## Verify

`bun run typecheck` and `bun run test` all green (all chunks). Report which
spec clauses drove each check and which vectors are covered.
