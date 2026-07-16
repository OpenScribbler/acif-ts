# acif-ts — chunk 11: per-OS script entries + provider-mechanism mapping

Continuation of the hook scope. Chunk 10 delivered `src/hook.ts` (§6 model +
§8 vocabulary). This chunk delivers the per-OS machinery and the
provider-mechanism input contract.

## Clean-room rule (same as chunk 10)

Semantics come ONLY from `spec-inputs/specs/hooks-interchange/spec.md` and
the [ACIF-CORE] sections it cites. Do NOT read
`spec-inputs/conformance/vectors/hook.yaml` or
`spec-inputs/conformance/vectors/platform.yaml`, and do not consult any other
implementation.

## Deliverable

- File: `src/hook_platform.ts` (import from `src/hook.ts` as needed).
  Tests: `test/hook_platform.test.ts`.
- Implement [ACIF-HOOK] §7 in full:
  - §7.1 closed OS enum, alias rewriting, absence vs `os: []` semantics,
    `arch` carriage, canonical array ordering.
  - §7.2 disjointness verification with the exact diagnostics and their
    required payloads (colliding OS values and entry indices).
  - §7.3 total selection, including the defined no-op branch and its
    mandatory report.
  - §7.5 tag provenance (`declared` / `inferred-from-convention`), recorded
    alongside the canonical form, never inside it.
- Implement §7.4 in full — read the whole section carefully; it defines a
  two-stage contract with a closed mechanism-token set (including an alias),
  a normative four-step evaluation order over a pre-abstracted provider
  configuration, per-token shape predicates, and per-row canonical mappings
  (including the per-OS key-map identity merge, the dual-shell collapse with
  its mandatory diagnostic, and the filename-extension convention with its
  inference diagnostics). Implement exactly the reject identifiers the
  evaluation order assigns to each step — the distinction between the
  totality-net identifier and the malformed-mechanism identifier is
  load-bearing for downstream consumers, and §14 states a MUST NOT direction;
  honor it.
- The pre-abstracted provider configuration arrives as an object with
  `provider` (the mechanism token), `path`, and optionally `content` (a
  structured value, or a string of JSON). This is the same shape the adapter
  op will pass through in chunk 13.
- Fix-forward detail text on every reject, per [ACIF-CORE] §8.7.

Out of scope: the hook `body_hash` preimage (chunk 12); projections,
install-time coverage, render-back, adapter wiring (chunk 13).

## Quality bar

- Tests cover: each §7.1/§7.2 reject; selection on every branch including
  the no-op; each mechanism token's happy path; each shape-predicate
  violation and each envelope fault mapping to the malformed identifier; an
  unknown token mapping to the totality net; the alias behaving identically
  to its member token; provenance values for declared vs inferred tags.
- `bun run typecheck` and `bun run test` green.
