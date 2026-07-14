# acif-ts — chunk 2: body_hash

Continuation of the clean-room ACIF TypeScript implementation. Chunk 1
delivered the scaffold and `src/canonical.ts` (canonical JSON per core §8.6) —
reuse it wherever the spec requires canonical JSON. `spec-inputs/` remains the
only allowed source of semantics and is read-only.

## Deliverable

`src/body_hash.ts` implementing the `body_hash` algorithm exactly as specified
in `spec-inputs/specs/core/spec.md` §7 (read all of §7.2–§7.8 carefully; §6
gives the surrounding carrier/identity model). Where §7 defers details to
other sections or other spec files in `spec-inputs/specs/`, follow those
references.

Structural guidance (semantics come from the spec, not from this list):

- Operate on in-memory bodies: input is a map of relative file paths to file
  contents (string or `Uint8Array`) plus whatever per-item parameters §7 says
  the algorithm depends on (e.g. entry file, sidecar handling). Filesystem
  ingestion is a later chunk — keep this module pure.
- Export a typed API for computing a body_hash, plus whatever intermediate
  functions §7 defines crisply enough to warrant their own exports (useful for
  later chunks and tests).
- Error conditions that §7/§8.7 define as named rejections must throw an error
  carrying the exact stable identifier string the spec mints (e.g. as an
  `id`/`code` property on the Error) — later chunks transport these verbatim.
- Node/bun built-in crypto is fine (still zero runtime npm deps).

## Tests

`test/body_hash.test.ts` (Vitest):

- Every vector in `spec-inputs/conformance/vectors/` whose expectations pin a
  `body_hash` value or body-hash behavior and whose inputs this module can
  represent (in-memory body + parameters) must be covered — e.g. TV-1 in
  `core.yaml`, and scan the other vector files (`skill.yaml`, `hook.yaml`,
  `agent.yaml`, `command.yaml`, `mcp.yaml`, `rule.yaml`, …) for body-hash
  cases. Load the YAML directly or transcribe inputs/expects verbatim; cite
  the vector id in the test name.
- Add unit tests for the named reject conditions of §7 (see the §8.7 table)
  that are reachable with in-memory inputs.
- Do not invent semantics beyond the published text.

Note: vitest cannot parse YAML natively; if you need YAML loading, transcribe
the vector inputs into the test file instead of adding a dependency.

## Verify

`bun run typecheck` and `bun run test` all green (including chunk 1 tests).
Report which spec clauses drove each design decision and which vectors are
covered.
