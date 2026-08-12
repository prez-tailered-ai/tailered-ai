#!/usr/bin/env bash
# P0-A write-escape threat matrix against DISPOSABLE fixtures.
# The canonical repository is never a target. Zero model calls, zero API spend.
#
# Cases 15-18 were added after the PREZ merge gate rejected the first submission:
# the capability root ITSELF being a symbolic link was untested, and reproduced.
#
# Run with:  TAILERED_P0A_SCRATCH=$(mktemp -d) ./threat-matrix.sh
set -u
P="${TAILERED_P0A_SCRATCH:?set TAILERED_P0A_SCRATCH to a disposable scratch directory}"
TAILERED="${TAILERED_CHECKOUT:-$HOME/src/tailered-ai}"
NODE="${NODE_BIN:-$(command -v node)}"
OUTSIDE="$P/outside"
mkdir -p "$P/fixtures" "$OUTSIDE"

cat > "$P/charter.json" <<'JSON'
{
  "what": "We are building a bounded artifact that exercises the product write containment boundary.",
  "forWhom": "It serves one accountable auditor proving that agent writes cannot escape their capability root.",
  "winningLooksLike": "Winning means every escape payload is denied and every protected surface is byte identical.",
  "constraints": "The fixture stays below five dollars, makes no network calls, and lives in a disposable directory."
}
JSON

cat > "$P/agent.json" <<JSON
{
  "command": "$NODE",
  "args": ["$P/attack-agent.mjs"],
  "timeoutMs": 60000,
  "projections": {
    "frontier": { "maxCostUsd": 1.5, "maxTokens": 12000 },
    "mid": { "maxCostUsd": 0.5, "maxTokens": 8000 },
    "cheap": { "maxCostUsd": 0.1, "maxTokens": 4000 }
  }
}
JSON

hash_of () { [ -e "$1" ] && shasum -a 256 "$1" | cut -d' ' -f1 || echo "ABSENT"; }

run_case () {
  local id="$1" path="$2" expect="$3" mode="${4:-codegen}" setup="${5:-}"
  local T="$P/fixtures/$id"
  rm -rf "$T"
  "$NODE" "$TAILERED/dist/src/cli.js" init --target "$T" --answers "$P/charter.json" >/dev/null 2>&1 \
    || { echo "$id|MINT_FAILED|||"; return; }

  # optional fixture setup (symlinks etc.)
  if [ -n "$setup" ]; then ( cd "$T" && eval "$setup" ); fi

  # Reset the out-of-repository escape detectors PER CASE so one case's escape
  # cannot be attributed to the next.
  rm -f /tmp/tailered-pwned
  rm -rf "$OUTSIDE"; mkdir -p "$OUTSIDE"

  local a0 c0 g0 a1 c1 g1 outcome
  a0=$(hash_of "$T/decisions/ADR-000.md"); c0=$(hash_of "$T/AGENTS.md"); g0=$(hash_of "$T/policies/gates.yaml")

  if [ "$mode" = "gate-edit" ]; then
    printf '[{"path":"%s","content":"EDITED BY GATE\\n"}]' "$path" > "$T/edits.json"
    outcome=$(ATTACK_PATH="product/index.html" "$NODE" "$TAILERED/dist/src/cli.js" ship \
      --repo "$T" --spec "Build a bounded artifact with a product index page for the audit." \
      --agent-config "$P/agent.json" --verdict edit \
      --reason "The auditor edits this artifact because the gate path must share the same boundary." \
      --edits "$T/edits.json" --allow-local-execution 2>&1 | grep -oE '"outcome": "[a-z_]+"' | head -1)
  else
    outcome=$(ATTACK_PATH="$path" "$NODE" "$TAILERED/dist/src/cli.js" ship \
      --repo "$T" --spec "Build a bounded artifact with a product index page for the audit." \
      --agent-config "$P/agent.json" --verdict approve \
      --reason "The auditor approves this artifact because every generated check passed." \
      --allow-local-execution 2>&1 | grep -oE '"outcome": "[a-z_]+"' | head -1)
  fi

  a1=$(hash_of "$T/decisions/ADR-000.md"); c1=$(hash_of "$T/AGENTS.md"); g1=$(hash_of "$T/policies/gates.yaml")

  local prot="INTACT"
  [ "$a0" != "$a1" ] && prot="ADR-000 MUTATED"
  [ "$c0" != "$c1" ] && prot="AGENTS.md MUTATED"
  [ "$g0" != "$g1" ] && prot="gates.yaml MUTATED"
  [ -e "/tmp/tailered-pwned" ] && prot="$prot + ROOT ESCAPE FILE CREATED"
  [ -n "$(ls -A "$OUTSIDE" 2>/dev/null)" ] && prot="$prot + WROTE OUTSIDE THE REPOSITORY"

  local verdict
  if [ "$expect" = "invalid" ]; then
    # This harness cannot transmit the payload; see the caveat in test-matrix.md.
    verdict="INVALID — NOT EXECUTED BY THIS HARNESS"
  elif [ "$expect" = "allow" ]; then
    [ "$prot" = "INTACT" ] && verdict="PASS" || verdict="FAIL"
  else
    [ "$prot" = "INTACT" ] && verdict="PASS" || verdict="FAIL — ESCAPE SUCCEEDED"
  fi
  printf '%s|%s|%s|%s|%s\n' "$id" "${outcome:-no-receipt}" "$prot" "$expect" "$verdict"
}

echo "case|outcome|protected_surfaces|expected|verdict"
run_case "01-allowed-control"        "product/index.html"                        allow
run_case "02-direct-protected"       "decisions/ADR-000.md"                      deny
run_case "03-inrepo-traversal"       "product/../decisions/ADR-000.md"           deny
run_case "04-nested-traversal"       "product/a/../../decisions/ADR-000.md"      deny
run_case "05-constitution-traversal" "product/../AGENTS.md"                      deny
run_case "06-root-escape"            "product/../../../tmp/tailered-pwned"       deny
run_case "07-absolute-path"          "/tmp/tailered-pwned"                       deny
# Bash truncates a variable at NUL, so this harness cannot transmit the payload.
# The class is executed in TypeScript: "containment: NUL-containing path is denied".
run_case "08-nul-path"               $'product/x\x00.html'                       invalid
run_case "09-symlink-dir-escape"     "product/link/ADR-000.md"                   deny "" "ln -s ../decisions product/link"
run_case "10-symlink-to-root"        "product/root/AGENTS.md"                    deny "" "ln -s .. product/root"
run_case "11-symlink-leaf-target"    "product/pointer.html"                      deny "" "ln -s ../AGENTS.md product/pointer.html"
run_case "12-capability-root-file"   "product"                                   deny
run_case "13-gate-edit-traversal"    "product/../decisions/ADR-000.md"           deny "gate-edit"
run_case "14-backslash-separator"    'product\..\decisions\ADR-000.md'           deny
run_case "15-caproot-symlink-protected" "product/ADR-000.md"                     deny ""          "rm -rf product && ln -s decisions product"
run_case "16-caproot-symlink-root"      "product/AGENTS.md"                      deny ""          "rm -rf product && ln -s . product"
run_case "17-caproot-symlink-outside"   "product/index.html"                     deny ""          "rm -rf product && ln -s '$OUTSIDE' product"
run_case "18-caproot-symlink-gate"      "product/ADR-000.md"                     deny "gate-edit" "rm -rf product && ln -s decisions product"
