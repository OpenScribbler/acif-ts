# acif-ts — chunk 8: NDJSON conformance adapter (protocol 2, core scope)

Continuation of the clean-room ACIF TypeScript implementation. Existing
modules: `src/canonical.ts`, `src/body_hash.ts`, `src/envelope.ts`,
`src/metadata_hash.ts`, `src/requires.ts`, `src/pack_id.ts`, `src/cli.ts`
(whose `ingestDirectory` walk you may extract/reuse for `body_root`
ingestion). `spec-inputs/` remains the only allowed source of semantics and
is read-only.

## Deliverable

The conformance adapter: an executable shim exposing this implementation to
the ACIF conformance runner over the protocol defined in
`spec-inputs/conformance/runner/PROTOCOL.md`. Read that document in full —
it is the complete contract — plus the vectors in
`spec-inputs/conformance/vectors/core.yaml` (TV-1..TV-13, TV-L2-*, TV-L3-*),
which show the request forms a core-scope run exercises.

- `src/adapter.ts` — protocol implementation: a request handler
  `handleRequest(request: unknown): Promise<unknown>` (pure, testable) plus
  a `runAdapter()` NDJSON stdin/stdout loop per PROTOCOL.md §1 (one request
  per line, one response line each, strictly in order, stateless across
  requests, stderr free for logs, UTF-8, no reliance on default line-buffer
  sizes).
- `bin/acif-adapter.ts` — bun entry calling `runAdapter()`.

Behavior, all per PROTOCOL.md:

- Handshake (§2): respond with implementation `acif-ts`, the version from
  package.json, `adapter_protocol: 2`, `scopes: ["core"]`.
- Response forms (§3): `{ok:true,result:{…}}`, `{ok:false,error:"<id>",
  diagnostics:[…]}`, or `{unsupported:true}`. Verdict transport for
  record-validation forms: `{conformant:false, reason:"<spec-minted id>"}`
  with `params` beside `reason` where Appendix A pins a shape. Top-level
  handler failures use the reserved `"error": "adapter: <detail>"` channel
  (§3) so internal bugs never masquerade as spec identifiers.
- Operations (§4): implement the request forms core-scope vectors need,
  mapping onto the existing library modules — `ingest` (§4.1: body_root
  ingestion with entry_file, sidecar form, pack-manifest form,
  publisher-section extraction, metadata_hash, verdict transport for
  record validation, diagnostics), `derive_pack_id` (§4.2), `resolve_pack`
  (§4.3), `evaluate_requires` (§4.4). Every other op or unservable request
  form: `{unsupported:true}` (§3 — per request form, not per op).
- The adapter adds NO semantics: every rule call must land in an existing
  module. If a §4.1 form needs glue the modules lack (e.g. faithful
  publisher_section extraction from a sidecar), build the glue in the
  adapter from the publisher-spec text (`spec-inputs/specs/publisher-spec/`),
  citing the section in a comment.

## Tests

`test/adapter.test.ts` (Vitest), driving `handleRequest` directly:

- Handshake shape.
- One test per implemented §4 request form, using inputs/expects transcribed
  from `core.yaml` vectors (cite vector ids), including at least one
  `{conformant:false, reason, params}` verdict (e.g. forbidden-field or
  orphan-key), one `{ok:false,error}` rejection (e.g. symlink via a temp dir),
  and one `{unsupported:true}` form.
- A malformed-request test exercising the `adapter:` internal-error channel.

## Verify

`bun run typecheck` and `bun run test` all green (all chunks). Also pipe a
two-line NDJSON session (hello + derive_pack_id with the TV-3 inputs) through
`bun bin/acif-adapter.ts` and show the output lines in your report.
