# acif-ts — chunk 9: conformance-canary CI

Final chunk of the clean-room ACIF TypeScript implementation. The repo now
contains the full library, CLI, and a protocol-2 NDJSON conformance adapter
(`bin/acif-adapter.ts`) that passes core scope 13/13 against the published
ACIF conformance runner.

## Deliverable

A scheduled canary that detects drift between this implementation and the
ACIF spec repo's published conformance suite.

1. `scripts/canary.sh` — a bash script that:
   - Clones (shallow) the ACIF spec repo into a temp dir. The repo URL comes
     from the `ACIF_SPEC_REPO` environment variable; default to the local
     path `$HOME/.local/src/agent-content-interchange-format` so the script
     is runnable today (no public remote exists yet).
   - Reads the suite head from `conformance/suite-manifest.yaml` in the
     clone and compares it against the pinned `source_commit` recorded in
     this repo's `spec-inputs/SNAPSHOT.yaml` — a mismatch means the suite
     moved; report it in the summary (drift signal, not a failure by
     itself).
   - Runs `bun run typecheck` and `bun run test` in this repo.
   - Runs the cloned repo's conformance runner against our adapter:
     `python3 -m conformance.runner --adapter "bun <this-repo>/bin/acif-adapter.ts" --scope core --report <tmp>/report.json`
     executed from the clone's root.
   - Exits non-zero if tests fail or the core scope status in the report is
     not "pass"; prints a one-block summary (suite head, snapshot commit,
     drift yes/no, core scope status).
2. `.github/workflows/canary.yml` — GitHub Actions workflow: `on: schedule`
   (weekly) + `workflow_dispatch`, ubuntu, installs bun (official setup
   action) and Python 3, runs `scripts/canary.sh`. Since the spec repo has
   no public remote yet, the scheduled job must treat a missing/unreachable
   `ACIF_SPEC_REPO` as "skipped: spec repo unavailable" (exit 0 with a clear
   notice) rather than a red run — the workflow becomes meaningful once a
   remote exists and `ACIF_SPEC_REPO` is set as a repo variable.
3. Add a `"canary": "bash scripts/canary.sh"` script to package.json.

Constraints:

- Parse the two YAML values you need (`suite:` head in suite-manifest.yaml,
  `source_commit:` in SNAPSHOT.yaml) with grep/sed in bash — no YAML parser,
  no new dependencies anywhere.
- The report JSON core-scope status check may use `python3 -c` or `bun -e`
  one-liners inside the script.
- Do not modify `spec-inputs/` or any library/adapter source in this chunk.

## Verify

Run `bash scripts/canary.sh` locally (with the default local spec repo path)
and include its summary block in your report. `bun run typecheck` and
`bun run test` stay green.
