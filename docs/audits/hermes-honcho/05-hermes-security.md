# 05 — Hermes security

Repository `NousResearch/hermes-agent` @ `ed5e17f4b86da0c4f09c0694757b6074ae6b9d16`.

## Scope calibration — read this before any finding

Hermes ships an unusually honest security policy, and judging it fairly requires holding
that policy in view.

`SECURITY.md` §2.2 states plainly:

> "**The only security boundary against an adversarial LLM is the operating system.**
> Nothing inside the agent process constitutes containment — not the approval gate, not
> output redaction, not any pattern scanner, not any tool allowlist."

§2.4 adds that the approval gate "catches cooperative-mode mistakes, not adversarial
output," §2.5 that plugins run with full agent privileges, and §3.2 **pre-declares
approval-regex and Skills-Guard bypasses out of scope** for its security channel.

This audit accepts that framing. Consequently:

- A generic "the dangerous-command regex can be bypassed" finding is **not** reported as a
  vulnerability. It is the documented design.
- What *is* reported is the narrower and legitimate class: **places where the code or the
  user-facing documentation asserts something absolute, and the code does not deliver it.**
  That is an intended-vs-implemented gap, and upstream's own framing does not excuse it.

The findings below are sorted on that basis.

## Runtime evidence

Unusually for this audit, parts of this lane have **real runtime evidence**. The auditor
executed `tools/approval.py`'s own detection source (lines 264-2196) in an isolated
scratchpad harness — stubbing only `strip_ansi` and `get_hermes_home`, modifying no repo
file — and ran concrete payloads through `detect_hardline_command` and
`detect_dangerous_command`. Those results are `OBSERVED`, not inferred.

### One correction to this lane's own summary

The security lane's narrative summary described `cli.py` as "~880K-line" and `run_agent.py`
as "~380K-line." **Both figures are wrong** — verified directly, `cli.py` is 18,915 lines and
`run_agent.py` is 8,303; ~865K is the *whole repository's* non-test Python total. The lane's
individual findings all cite exact line ranges and those spot-check correctly; only the
prose scale-setting was inflated. Recorded here rather than silently fixed, because an audit
that hides its own corrections is not auditable.

## Class 1 — absolute claims the code does not deliver

### SEC-H-01 (CRITICAL) — the "never bypassable" hardline floor is defeated by a path-qualified binary

`tools/approval.py:523` and `:634-643`, and `website/docs/user-guide/security.md:91-101`,
describe a hardline floor that is "NEVER bypassable, even in YOLO mode."

`_CMDPOS` (`approval.py:382-392`) anchors to a command position followed by the **literal
token `rm`**, permitting only the wrapper set `{sudo, env, exec, nohup, setsid, time}`. Any
other spelling of the same binary is not recognised.

Executed against the module's own detector:

| Payload | `detect_hardline_command` | Result |
|---|---|---|
| `/bin/rm -rf /` | **False** | falls through to the bypassable layer |
| `/usr/bin/rm -rf /` | False | " |
| `command rm -rf /` | False | " |
| `nice rm -rf /` | False | " |
| `timeout 5 rm -rf /` | False | " |
| `busybox rm -rf /` | False | " |
| `bash -c "/bin/rm -rf /"` | False | " |
| `sudo rm -rf /` (control) | True | floor holds |
| `\rm -rf /`, `ｒｍ -rf /` (controls) | True | floor holds |

Each non-hardline payload still matches `DANGEROUS_PATTERNS` ("delete in root path",
`approval.py:694`) — but that check is evaluated **after** the yolo / `mode: off` bypass at
`approval.py:3784-3786`. So under `--yolo`, `/yolo`, `approvals.mode: off`, or any
non-interactive session (SEC-H-06), `/bin/rm -rf /` executes.

This is in scope because the claim is absolute. The fix is also small: apply the existing
`realpath`/basename normalization already used for protected instruction files
(`file_tools.py:798-819`) to the hardline matcher.

**Independently CONFIRMED** by an adversarial verifier instructed to refute it.

Two refinements that verification added, and one it took away:

- **Taken away:** a separate claim-matrix entry asserting that the *documented* "always-on
  hardline floor" is misleading did **not** survive. `detect_hardline_command` genuinely is
  invoked at `tools/approval.py:3757-3760`, **before** the YOLO bypass at `:3785`. The floor
  is structurally always-on exactly as documented; the defect is in its *pattern matching*,
  not its placement. The audit records that correction rather than keeping the stronger
  claim.
- **Added:** `_should_skip_container_guards()` at `tools/approval.py:3750` returns
  `{"approved": True}` **before** the hardline check for isolated container backends without
  host bind-mounts — so the documentation's "regardless of" list at `security.md:93-98` is
  incomplete on a second, independent axis.
- **Added:** the same documentation section lists `curl`/`wget` piped to `sh` as
  hardline and unbypassable, while that pattern actually lives in `DANGEROUS_PATTERNS`
  (`tools/approval.py:754`) and **is** YOLO-bypassable per the comment at `:370` and the
  assertions in `tests/tools/test_hardline_blocklist.py`. That is a materially false safety
  claim in user-facing documentation.

For completeness: the verifier also established that wrapper-prefixed `rm` **is** tested
(`tests/tools/test_approval.py:262` covers `sudo rm -rf /tmp`), so no claim of untested
wrappers is made here.

### SEC-H-07 (HIGH) — policy-file protection is text-pattern-only and symlink-defeatable

The `~/.hermes/config.yaml` guard is regex over the raw command string
(`approval.py:775-782, 852-891`) with **no realpath step**. Observed:
`ln -sf /tmp/evil ~/.hermes/config.yaml` → no finding; `echo "approvals:" > /tmp/c` → no
finding. The two-step sequence rewrites the live policy file with zero approval, and the
module's own mtime-keyed cache picks it up mid-session. Positive controls (`tee`, `sed -i`,
`mv`, direct redirect, python `open()`) all correctly produce findings — so the guard works
except through indirection. Notably `file_tools.py:798-819` *does* realpath; the terminal
path does not.

### SEC-H-05 (HIGH) — `hermes -z` is a self-reachable privilege escalation

`hermes_cli/oneshot.py:221-222` unconditionally sets `HERMES_YOLO_MODE=1` and
`HERMES_ACCEPT_HOOKS=1`. `hermes` is on PATH after install, and `DANGEROUS_PATTERNS` gates
only `hermes … gateway stop|restart` and `hermes update`. Observed:
`detect_dangerous_command('hermes -z "wipe the disk"')` → `(False, None, None)`.

A prompt-injected agent in an approvals-**enabled** session can therefore spawn an
unattended child that inherits the parent's credentials and runs with approvals disabled.
This crosses upstream's own boundary model: it is not "a regex missed a payload," it is a
supported entrypoint that removes the operator from the loop.

## Class 2 — coverage gaps (gates that simply do not run)

### SEC-H-03 (HIGH) — `execute_code` has no approval gate in the default interactive CLI

`check_execute_code_guard` returns `{"approved": True}` unconditionally for any session that
is neither gateway nor `HERMES_EXEC_ASK` (`approval.py:4293-4294`). Interactive CLI is
neither. The stated compensating control — "the script's `terminal()` calls are guarded
per-call" — only covers RPC back into the Hermes `terminal` tool; a script calling
`subprocess.run`, `os.system`, or `shutil.rmtree` **directly in the child process** touches
no guard, and the hardline floor is never consulted. `execute_code` is a core default tool
(`toolsets.py:74`).

### SEC-H-04 (HIGH) — `browser_exec` has no gate at all

Model-authored Python is piped into a host subprocess with no approval gate of any kind
(`tools/browser_use_cli.py:299-377`).

### SEC-H-06 (HIGH) — non-interactive sessions auto-approve everything

When `is_cli`, `is_gateway`, and `is_ask` are all false and the session is not cron,
`check_all_command_guards` returns approved at `approval.py:3861`. `HERMES_INTERACTIVE` is
set by only four call sites; **oneshot, `batch_runner.py`, and `mini_swe_runner.py` never
set it.** Documented fail-open, but it compounds SEC-H-05 and SEC-H-01.

### HA-203 (CRITICAL) — `computer_use` defaults to ALLOW with no callback registered

Full host mouse/keyboard/typing control defaults to allow when no CLI approval callback is
registered (`computer_use/tool.py:480`). A default-allow on a full-host-input capability is
the most severe single default in the tool layer.

### HA-201 (HIGH) — there is no single approval chokepoint

`registry.dispatch()` (`tools/registry.py:801`) executes handlers with **zero** permission,
approval, or enabled-tool checks. Enforcement is scattered across at least seven mutually
independent gates, each owned by the tool it protects, each with its own fail-open policy:
`terminal` → `check_all_command_guards`; `execute_code` → `check_execute_code_guard`; MCP →
`_trust_gate_check` (a no-op, since servers default to `trust: full`); protected instruction
files → a deliberately separate path; memory/skills → `write_approval` (default off);
`computer_use` → its own store (default allow); plugin `pre_tool_call` → fail-closed
internally but wrapped in bare `except: pass` at both call sites (HA-212).

Related: `process(action='write'|'submit')` writes arbitrary bytes to a live PTY, bypassing
`check_all_command_guards` entirely (HA-204); `tui_gateway` exposes `shell.exec` as a
JSON-RPC method running `shell=True` (HA-213); isolated-container backends skip all command
approval (HA-215, SEC-H-16).

### HA-211 / SEC-H-13 (MEDIUM) — the default approver is an auxiliary LLM, not a human

`approvals.mode` defaults to `smart`, delegating the decision to an auxiliary model reading
attacker-influenced command text.

## Class 3 — supply chain and content scanning

- **SEC-H-09 (HIGH):** the Tirith security scanner is auto-downloaded from GitHub `latest`
  with optional signature verification.
- **SEC-H-10 (MEDIUM):** Tirith content scanning fails open by default and **self-disables
  permanently after three failures**.
- **SEC-H-08 (HIGH):** the context-file injection scanner reads only the first 64 KB while
  up to 500 KB (head+tail) is injected — a payload placed in the tail is never scanned.
- **SEC-H-12 (MEDIUM):** agent-created skills are unscanned by default and auto-load into
  future sessions — an unapproved prompt-injection persistence path (compounds HA-304).
- **SEC-H-11 / HA-313 (MEDIUM):** Skills Guard is bypassed by an attacker-supplied
  `.skillignore` and by unscanned extensions; its verdict ignores medium/low findings.
- **SEC-H-14 (MEDIUM):** MCP tool descriptions are scanned but never blocked, MCP results
  are not scanned at all, and default server trust is `full`.

## Controls that verifiably work (SEC-H-21, HA-217, HA-218)

An audit that reports only weaknesses is not honest. These were read end-to-end and hold:

- **API server authentication** — refuses to start without `API_SERVER_KEY`, fails **closed**
  when the strength checker cannot be imported, rejects placeholders and keys <16 chars,
  and uses `hmac.compare_digest` (`gateway/platforms/api_server.py:7109-7146, 1812-1830`).
- **Protected instruction files** — writes to `AGENTS.md`/`CLAUDE.md`/`SOUL.md`/`.cursorrules`
  are always-ask, deliberately **not** routed through the yolo-honouring gate, fail closed
  with no human channel, and match on both the normalized path **and its realpath** to
  defeat symlinks (`file_tools.py:798-955`). This is the correct pattern — and its absence
  in the hardline matcher is exactly SEC-H-01.
- **Subagent auto-deny** by default, with `delegate_task`/`memory`/`cronjob` removed from
  children (`delegate_tool.py:49-115`).
- **Iteration budgets** bound tool-loop exhaustion; a 3-denial smart-approval circuit
  breaker; a human-wait ceiling a wedged plugin cannot stretch.
- **Credential scrubbing** for shell/MCP/cron/exec children is layered and fails closed
  (`tools/env_passthrough.py:49-89`) — though it is display-only against an adversarial
  model that simply reads `~/.hermes/.env` (SEC-H-20).
- **The approval pre-parser is genuinely sophisticated** — 4,553 lines with NFKC folding,
  `$IFS` collapse, line-continuation joining, home-prefix folding, `bash -c` payload
  recursion, and grep-PCRE data masking. SEC-H-01 is a gap in its *command-position* model,
  not evidence of a careless implementation.

## What this means for adoption

Nothing here disqualifies Hermes for the use its authors describe: a **single-tenant
personal agent run by a trusting operator**, ideally under whole-process isolation.

It does mean that any Tailered AI adoption must supply OS-level isolation, because
Hermes explicitly declines to provide it. That requirement is identical to what POC-A
established from the other direction: Tailered's process boundary bounds mutation and
accounting but not execution. **Both systems agree containment lives in the OS**, which is
why Architecture D is coherent in principle and why it is gated on a disposable worker with
no ambient credentials in `19-implementation-roadmap.md`.

The findings that would matter most to a Tailered agent platform — default-allow `computer_use`,
no dispatch chokepoint, non-interactive auto-approve, and the self-reachable `hermes -z`
escalation — are all reasons to run any Hermes-derived process as an untrusted subprocess
rather than as a library inside a service.
