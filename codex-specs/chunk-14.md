# acif-ts — chunk 14: hook scope conformance to the 2026-09-30 hook spec amendments

Chunks 10–13 delivered the hook scope against the spec as pinned in
`spec-inputs/` at that time. `spec-inputs/` has now been re-pinned (see
`spec-inputs/SNAPSHOT.yaml`), and `spec-inputs/specs/hooks-interchange/spec.md`
changed in four places that this implementation must follow. Bring the
hook scope into line with the current text.

## Clean-room rule (same as chunks 10–13)

Semantics come ONLY from `spec-inputs/specs/hooks-interchange/spec.md`, the
[ACIF-CORE] sections it cites (`spec-inputs/specs/core/spec.md`), and — for
the adapter surface — `spec-inputs/conformance/runner/PROTOCOL.md`. Do NOT
read `spec-inputs/conformance/vectors/hook.yaml` or
`spec-inputs/conformance/vectors/platform.yaml`, do not consult any other
implementation, and do not look at other git branches or git history of
this repo. Treat all of `spec-inputs/` as read-only. Do not run the
conformance suite; the maintainer runs it after this chunk lands.

## What changed in the spec (read each section in full)

1. **Appendix A.1, the canonical event table.** It now has 44 rows.
   Provider columns were corrected to each provider's documented names
   (for example cursor's names are camelCase; some names were removed),
   and five canonical events were added: `before_shell_execute`,
   `after_shell_execute`, `before_mcp_execute`, `after_mcp_execute`,
   `before_file_read`. Ingest must canonicalize every native name the
   table lists and reject names it no longer lists, with the diagnostic
   the spec defines for an unknown event.
2. **Appendix A.4, render-back resolution.** A.4 lists pinned renders,
   some lossless and some degraded, and an ordered rule list where the
   first matching rule wins. A degraded render, and the rule for a
   provider listed without a native name, emit
   `acif.hook.event_untranslatable` with the params Appendix A / the
   diagnostics table pins (`event`, `provider`). Implement the rules in
   the spec's order.
3. **§6.2 matcher pass-through.** On the narrow events §6.2 names, a
   matcher passes through without tool-name translation. Other events
   keep their existing matcher translation.
4. **The non-equivalence statement** near A.4: read it and make sure no
   code treats the events it names as interchangeable.

## Approach

- `src/hook.ts` holds the event tables and `src/hook_render.ts` the
  render-back. Prefer one transcription of A.1 from which every lookup
  (canonical set, native→canonical, provider list) derives, rather than
  several hand-synced tables.
- Keep the existing code style and module boundaries; extend, don't
  fork.
- Diagnostics in the PROTOCOL.md §3.1 structured shape with the exact
  pinned params.

## Quality bar

- Unit tests for: every A.1 provider column's names (table-driven is
  fine), removed names rejecting, each A.4 pin (lossless and degraded,
  checking diagnostic and params), each A.4 rule, and matcher
  pass-through on the narrow events vs translation on a general tool
  event. Extend `test/hook.test.ts` and `test/hook_render.test.ts`.
- `bun run typecheck` and `bun run test` green.
- Report what you changed, and any place where the spec text was
  ambiguous and how you read it.
