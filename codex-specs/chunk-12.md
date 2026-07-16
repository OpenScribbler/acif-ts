# acif-ts — chunk 12: the hook body_hash preimage

Continuation of the hook scope. Chunks 10–11 delivered the canonical hook
model, vocabulary translation, per-OS machinery, and the §7.4 mechanism
mapping. This chunk delivers the hook `body_hash`.

## Clean-room rule (same as chunks 10–11)

Semantics come ONLY from `spec-inputs/specs/hooks-interchange/spec.md` and
the [ACIF-CORE] sections it cites. Do NOT read
`spec-inputs/conformance/vectors/hook.yaml` or
`spec-inputs/conformance/vectors/platform.yaml`.

## Deliverable

- File: `src/hook_hash.ts`. Tests: `test/hook_hash.test.ts`.
- Implement [ACIF-HOOK] §9 exactly:
  - §9.1 inputs are the post-canonicalization form — wire this to the chunk
    10/11 pipeline so hashing can never see pre-mapping bytes.
  - §9.2 the referenced-file manifest: the referenced-file set, existence
    requirement, the full path-validity rule with its reject identifier,
    source-root resolution, and the manifest construction with the
    [ACIF-CORE] §7.3/§7.4 bindings the section states (per-file hashing,
    normalization, entry format, ordering, the empty-manifest case).
  - §9.3 the wiring serialization: canonical JSON of the complete canonical
    extension block (reuse `src/canonical.ts`), the array-ordering rules,
    and inline-content normalization.
  - §9.4 the preimage construction and `body_hash` value/algorithm fields.
- Where existing core modules already implement a cited [ACIF-CORE]
  behavior (canonical JSON §8.6, per-file text/binary hashing §7.3), reuse
  them rather than reimplementing; if a core module's surface is too narrow,
  extend it minimally.

Out of scope: projections, install coverage, render-back, adapter wiring
(chunk 13).

## Quality bar

- Tests cover: manifest construction including sorting, duplicate-path
  collapse, and the empty manifest; missing-file and invalid-path rejects;
  the consequences §9.4 states (an `os` re-target moves the hash with file
  bytes unchanged; an opaque passthrough flip moves the hash; two sources
  differing only in set ordering or inline line endings hash identically).
- `bun run typecheck` and `bun run test` green.
