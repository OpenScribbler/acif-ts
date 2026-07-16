# acif-ts — chunk 10: hook canonical model + vocabulary translation

Continuation of the clean-room ACIF TypeScript implementation. Chunks 1–9
delivered the core scope (canonical JSON, body_hash, envelope, metadata_hash,
requires, pack ids, URI, CLI, NDJSON adapter). This chunk begins the **hook
scope**.

## Clean-room rule for the hook scope (stricter than core)

The ONLY allowed sources of semantics for this and every later hook chunk are:

- `spec-inputs/specs/hooks-interchange/spec.md`
- `spec-inputs/specs/core/spec.md` (where the hooks spec cites it)

Do NOT read `spec-inputs/conformance/vectors/hook.yaml` or
`spec-inputs/conformance/vectors/platform.yaml`, and do not consult any other
implementation. The hook scope exists to be an independent differential
witness; an implementation derived from the vectors or another impl defeats
its purpose. Treat all of `spec-inputs/` as read-only.

## Deliverable

- File: `src/hook.ts`. Tests: `test/hook.test.ts` (Vitest).
- Implement the canonical hook model of [ACIF-HOOK] §6: the extension-block
  schema, every §6.2 field requirement, and the reject conditions those
  requirements state (`event` recognition, `handlers` presence and order
  preservation, `scripts` placement rules, `matcher` non-emptiness,
  `auxiliary_files`, `async`/`blocking` default materialization per
  [ACIF-CORE] §8.1, `requires` emptiness, `activation_target`).
- Implement §8 vocabulary canonicalization: provider-native event-name
  translation per Appendix A (including A.2 validity and the A.3
  reverse-translation tiebreaker for later render use), and handler-type
  handling per §8.2 and Appendix B (absent/empty type materializes to
  `command`; the provider-native alias set is empty).
- Every reject/diagnostic identifier this chunk emits must use the exact
  `acif.hook.*` strings from §14 and carry fix-forward detail text where
  [ACIF-CORE] §8.7 requires it.
- Opaque passthrough fields are retained per [ACIF-CORE] §8.5.

Out of scope for this chunk (later chunks): per-OS script entry semantics and
§7.4 provider mechanisms (chunk 11), the hook `body_hash` preimage (chunk 12),
derivation predicates, projections, install coverage, render-back, and adapter
wiring (chunk 13). Where §6.2 references §7 constraints (e.g. script entry
shape), validate only what §6.2 itself states and leave §7 enforcement to
chunk 11 — structure the code so chunk 11 can add it without rework.

## Quality bar

- Strict TypeScript, zero runtime dependencies, bun runtime — as in prior
  chunks.
- Tests cover each reject condition and each materialization this chunk
  implements, plus at least one happy-path canonicalization with handler
  order preserved.
- `bun run typecheck` and `bun run test` green.
