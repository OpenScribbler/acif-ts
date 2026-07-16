# acif-ts — chunk 13: hook dispositions, projections, install rule, render-back, adapter wiring

Final hook-scope chunk. Chunks 10–12 delivered the model, per-OS + mechanism
mapping, and the hash. This chunk completes the scope and exposes it through
the adapter.

## Clean-room rule (same as chunks 10–12)

Semantics come ONLY from `spec-inputs/specs/hooks-interchange/spec.md`, the
[ACIF-CORE] sections it cites, and — for the adapter surface —
`spec-inputs/conformance/runner/PROTOCOL.md`. Do NOT read
`spec-inputs/conformance/vectors/hook.yaml` or
`spec-inputs/conformance/vectors/platform.yaml`.

## Deliverable

1. **Capability dispositions** ([ACIF-HOOK] §10): the three DERIVABLE `D_K`
   predicates over the canonical body, and the orphan-key/unknown-key
   behavior §10.3 states via [ACIF-CORE] §9.4/§9.5 — reuse the existing
   `src/requires.ts` machinery; extend its vocabulary tables rather than
   forking them. File: extend `src/requires.ts` (or a small
   `src/hook_requires.ts` if cleaner).
2. **Registry projections** ([ACIF-HOOK] §13.1): `os_coverage` with every
   field it specifies, including the `os_divergent` executable-identity
   predicate and the provenance rollup. File: `src/hook_project.ts`.
3. **Install-time coverage-gap rule** ([ACIF-HOOK] §11): evaluate a command
   handler against an install-target OS segment and return the table's
   outcome (proceed / must-refuse-with-override / should-warn + defined
   no-op), with the section's diagnostic.
4. **Render-back** ([ACIF-HOOK] §12): degradation to no-mechanism providers
   with the mandatory drop diagnostic; the §12.2 no-default rule keyed on
   selection (emit vs refuse); §12.3 passthrough via structured encoding,
   dead-default preservation, and name translation with the Appendix A.3
   tiebreaker. File: `src/hook_render.ts`.
5. **Adapter wiring**: extend `src/adapter.ts` so the hook scope is
   reachable through the PROTOCOL.md operations (`ingest` with a hook
   sidecar or a `provider_config`, `render`, `project`, `evaluate_install`,
   and whichever others PROTOCOL.md defines as applicable to hooks — read
   §4 and Appendix A and implement what applies). Add `"hook"` to the
   handshake `scopes` array. Diagnostics must be emitted in the §3.1
   structured shape with the exact pinned params Appendix A requires for
   the identifiers this scope emits.

## Quality bar

- Tests per deliverable: `test/hook_project.test.ts`,
  `test/hook_render.test.ts`, extensions to `test/requires.test.ts` and
  `test/adapter.test.ts` covering the new ops end-to-end over NDJSON.
- `bun run typecheck` and `bun run test` green.
- Do not run the conformance suite yourself and do not read the vector
  files — the maintainer runs the suite and the differential after this
  chunk lands; the suite is the oracle, not the source.
