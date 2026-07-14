#!/usr/bin/env bash
set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
default_spec_repo="$HOME/.local/src/agent-content-interchange-format"
spec_repo="${ACIF_SPEC_REPO:-$default_spec_repo}"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/acif-canary.XXXXXX")"
spec_clone="$tmp_root/spec"
report_json="$tmp_root/report.json"

suite_head="unknown"
snapshot_commit="unknown"
drift="unknown"
core_status="not-run"
typecheck_status="not-run"
test_status="not-run"
conformance_status="not-run"

cleanup() {
  rm -rf "$tmp_root"
}
trap cleanup EXIT

notice() {
  printf '%s\n' "$*"
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    printf '::notice title=ACIF canary::%s\n' "$*"
  fi
}

print_summary() {
  cat <<SUMMARY
acif canary summary
suite head: $suite_head
snapshot commit: $snapshot_commit
drift: $drift
core scope status: $core_status
SUMMARY
}

clone_source="$spec_repo"
if [[ -d "$spec_repo" ]]; then
  if spec_abs="$(cd "$spec_repo" 2>/dev/null && pwd -P)"; then
    clone_source="file://$spec_abs"
  fi
fi

export GIT_TERMINAL_PROMPT=0
if ! git clone --depth 1 --quiet "$clone_source" "$spec_clone"; then
  notice "skipped: spec repo unavailable: $spec_repo"
  exit 0
fi

suite_manifest="$spec_clone/conformance/suite-manifest.yaml"
snapshot_file="$repo_root/spec-inputs/SNAPSHOT.yaml"

if [[ -f "$suite_manifest" ]]; then
  suite_head="$(grep -m1 '^[[:space:]]*-[[:space:]]*suite:' "$suite_manifest" | sed 's/^[[:space:]]*-[[:space:]]*suite:[[:space:]]*//; s/[[:space:]]*$//')"
  suite_head="${suite_head:-unknown}"
fi

if [[ -f "$snapshot_file" ]]; then
  snapshot_commit="$(grep -m1 '^source_commit:' "$snapshot_file" | sed 's/^source_commit:[[:space:]]*//; s/[[:space:]]*$//')"
  snapshot_commit="${snapshot_commit:-unknown}"
fi

spec_head="$(git -C "$spec_clone" rev-parse HEAD 2>/dev/null || true)"
if [[ -n "$spec_head" && "$snapshot_commit" != "unknown" && "$spec_head" == "$snapshot_commit" ]]; then
  drift="no"
else
  drift="yes"
fi

exit_code=0

if (cd "$repo_root" && bun run typecheck); then
  typecheck_status="pass"
else
  typecheck_status="fail"
  exit_code=1
fi

if (cd "$repo_root" && bun run test); then
  test_status="pass"
else
  test_status="fail"
  exit_code=1
fi

adapter_path="$repo_root/bin/acif-adapter.ts"
adapter_cmd="bun $(printf '%q' "$adapter_path")"

if (cd "$spec_clone" && python3 -m conformance.runner --adapter "$adapter_cmd" --scope core --report "$report_json"); then
  conformance_status="pass"
else
  conformance_status="fail"
  exit_code=1
fi

if [[ -f "$report_json" ]]; then
  core_status="$(
    python3 -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8")).get("scopes", {}).get("summary", {}).get("core", {}).get("status", "missing"))' "$report_json" 2>/dev/null \
      || printf 'missing'
  )"
elif [[ "$conformance_status" == "fail" ]]; then
  core_status="missing"
fi

if [[ "$core_status" != "pass" ]]; then
  exit_code=1
fi

print_summary
exit "$exit_code"
