# acif-ts — chunk 7: CLI (`acif validate` / `hash` / `ingest`)

Continuation of the clean-room ACIF TypeScript implementation. Existing
modules: `src/canonical.ts`, `src/body_hash.ts`, `src/envelope.ts`,
`src/metadata_hash.ts`, `src/requires.ts`, `src/pack_id.ts`. `spec-inputs/`
remains the only allowed source of semantics and is read-only.

## Deliverable

A CLI wiring the existing library modules to the filesystem and stdin/stdout.
No new spec semantics in this chunk — the CLI is transport; every rule it
enforces must come from an existing module (extend a module only if a
filesystem-level rule from core §7.4 has no home yet, e.g. symlink discovery).

- `src/cli.ts` — command implementation, exported as a function
  `runCli(argv: string[]): Promise<number>` returning the exit code, so tests
  can drive it without spawning a process.
- `bin/acif.ts` — thin bun entry (`#!/usr/bin/env bun`) calling `runCli`.
  Add a `"bin"` field to package.json.

Commands (JSON in/out; YAML is intentionally unsupported — input records are
JSON):

- `acif validate <record.json|->` — parse a record, run envelope validation
  (core §5) and requires validation (core §9) for item kinds; print a JSON
  result `{ok, rejections:[{id, params?}]}` to stdout. Exit 0 when ok, 1 when
  rejected, 2 on usage/IO/parse errors.
- `acif hash body --dir <path> --entry <name>` — ingest the directory (see
  ingest rules) and print `{algorithm, value, classification}`.
  `acif hash metadata <publisher_section.json|->` — print `{algorithm, value}`
  per publisher §6.
- `acif ingest --dir <path> --entry <name>` — walk the directory into an
  in-memory body honoring core §7.4's filesystem rules (regular files only,
  version-control exclusions per the module, symlink reject with the exact
  spec identifier — detect symlinks with lstat during the walk, never follow
  them), then print a JSON report: classification, body_hash, and the sorted
  manifest entries `[{path, hash}]`. Same exit-code convention.

Structural constraints:

- Argument parsing by hand (no npm deps); keep it minimal — positional +
  `--flag value`, `-` meaning stdin.
- Errors from library modules print `{ok:false, rejections:[...]}` with the
  stable ids; unexpected exceptions print to stderr and exit 2.
- Use `node:fs/promises` + `lstat`/`readdir` (bun-compatible built-ins).

## Tests

`test/cli.test.ts` (Vitest): drive `runCli` directly with temp directories
(`fs.mkdtemp` in the OS tmpdir) — cover validate ok/reject/parse-error, hash
body single- and multi-file (reuse a pinned vector body, e.g. TV-1's, and
assert its published hash), hash metadata (TV-2/TV-9 pinned values), ingest
happy path + symlink reject (create a real symlink; skip the case gracefully
if the platform cannot create one). Assert both stdout JSON shape and exit
codes.

## Verify

`bun run typecheck` and `bun run test` all green (all chunks). Also run the
bin entry once against a real temp directory (`bun bin/acif.ts ...`) and show
the output in your report.
