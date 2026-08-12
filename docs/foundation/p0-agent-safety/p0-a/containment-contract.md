# P0-A — the write containment contract

The exact invariant enforced by `resolveContainedWritePath`.

## Invariant

> An agent or human gate granted authority to write a capability root (in v1,
> `product/`) may mutate only the **canonical filesystem subtree** belonging to that
> root. No lexical traversal, normalization behavior, symlink, canonical-path
> redirection, or malformed path may cause a write outside it.

## Rules

1. **Repository-relative only.** Absolute paths are rejected. Paths containing a NUL
   byte are rejected.
2. **One canonical capability root.** Authority is expressed as a root directory
   (`product/`), resolved to its canonical form before any comparison.
3. **Lexical containment.** After resolving `.` and `..`, the destination must lie
   strictly beneath the capability root. Containment is decided by `relative()`
   semantics, never by a string prefix.
4. **Canonical containment.** Every ancestor that already exists on disk is resolved.
   The destination must remain beneath the *canonical* capability root, so a
   redirection through an existing directory cannot move the write.
5. **No symlink components.** Any existing component of the destination path below the
   capability root — including the leaf — that is a symbolic link is rejected. A
   symlink can be repointed at any moment, so it can never be part of a proven
   containment decision.
6. **Fail closed.** If containment cannot be positively established — the capability
   root is missing, a component cannot be inspected, or any filesystem error occurs —
   the write is refused. Absence of proof is refusal, never permission.
7. **One enforcement path.** Agent code generation, critique repair, and founder/gate
   edits are all externally supplied paths and all pass through the same primitive.
8. **The root is not a file.** The capability root itself cannot be overwritten as a
   file; the destination must be strictly beneath it.
9. **No indirect reach.** Protected surfaces (`decisions/`, `AGENTS.md`, `policies/`,
   `loops/`, `seats/`, ledgers, config) are outside the capability root, so rules 3-5
   place them out of reach without needing a denylist.
10. **Checks are not durable.** A containment result describes the filesystem at the
    moment of the check. See the TOCTOU boundary below.

## Explicitly insufficient

```ts
if (path.startsWith("product/")) { /* allow */ }      // the original defect
if (path.includes("..")) { /* reject */ }             // still no canonical proof
```

The first is satisfied by `product/../decisions/ADR-000.md`. The second blocks that
string but proves nothing about symlinks or canonical resolution, and rejects
legitimate names containing two dots.

## Residual TOCTOU boundary — stated, not hidden

Containment is verified immediately before the write, and the write itself is
`open(..., "wx")` followed by `rename()` into place. Between verification and rename,
a **local process with write access to the company repository** could replace a
verified directory with a symlink and redirect the write.

This audit does **not** claim that race is closed. Closing it fully would require
either directory file descriptors with `openat`-style resolution (not exposed by
Node's `fs` API) or a platform-specific `O_NOFOLLOW`/`RESOLVE_BENEATH` mechanism.

What is claimed, and tested:

- No **agent-supplied path string** can escape the capability root.
- No **pre-existing symlink** can redirect a write, because symlink components are
  rejected outright rather than resolved.
- The remaining exposure requires an attacker that already has local write access to
  the repository during the run — at which point the agent boundary is not the
  relevant control, and `docs/agent-protocol.md`'s existing requirement to run in an
  isolated, disposable worker applies.

## Test mapping

| Rule | Tests |
|---|---|
| 1 | absolute path; NUL-containing path |
| 3 | in-repository traversal; nested traversal; constitution traversal; root escape |
| 4, 5 | symlinked directory; symlink to repository root; symlink leaf |
| 6 | covered by fail-closed error paths in the primitive |
| 7 | founder gate edit path |
| 8 | capability root as a file |
| — | legitimate control; nested legitimate subdirectory; terminal-eval preservation |
