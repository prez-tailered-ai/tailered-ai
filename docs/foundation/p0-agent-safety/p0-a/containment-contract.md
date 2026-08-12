# P0-A — the write containment contract

The exact invariant enforced by `resolveContainedWritePath`.

## Invariant

> An agent or human gate granted authority to write a capability root (in v1,
> `product/`) may mutate only the **canonical filesystem subtree** belonging to that
> root. No lexical traversal, normalization behavior, symlink, canonical-path
> redirection, or malformed path may cause a write outside it.

## Rules

Each rule is a **separate obligation that must be positively proven**. v1 failed because
three of them — rules 4, 5 and 6 — were assumed to follow from a single `realpath()`
call. Nothing here is derived from anything else.

### The input

1. **Repository-relative only.** Absolute paths are rejected. Paths containing a NUL byte
   are rejected. This is a precondition on the caller-supplied string, not a containment
   proof.

### The boundary — proven, never derived

2. **Repository-root canonicalization.** The repository root is resolved to its canonical
   form **once**. Symlinks *at or above* the repository root — including the root itself
   being an alias — belong to the operator's own filesystem layout (`/tmp` →
   `/private/tmp`, an aliased checkout). They are supplied by the operator via `--repo`,
   not by the agent, and are legitimate. The positive control exercises exactly this.
3. **Capability-root lexical identity.** The capability root is computed lexically from
   the repository root (`resolveRepoPath(root, "product")`), so its identity is fixed by
   configuration and cannot be influenced by the requested path.
4. **Capability-root existence.** Every component of the capability root, from the
   canonical repository root downwards, must exist. A missing component is a refusal, not
   a directory to create.
5. **Capability-root directory type.** Every such component must be a **directory**. A
   file, socket, device or FIFO in that position is a refusal.
6. **Capability-root non-symlink status.** No component of the capability root may be a
   **symbolic link**. The root is *walked and verified*, never canonicalized —
   canonicalizing it adopts the link's target as the boundary, which hands the definition
   of the authority boundary to whoever controls the link. **This is the rule v1 lacked.**
7. **Descendant component non-symlink status.** Any already-existing component of the
   destination path *below* the capability root — including the leaf — that is a symbolic
   link is rejected rather than resolved.

### The destination

8. **Lexical containment.** After resolving `.` and `..`, the destination must lie
   strictly beneath the capability root. Containment is decided by `relative()`
   semantics, never by a string prefix, and never by the absence of `..`. Strictly
   beneath also means the capability root itself is not a writable destination.
9. **Canonical containment.** After the component walk, the destination must still be
   beneath the canonical capability root, so no already-existing directory can move it.

### The behaviour

10. **Fail closed.** If containment cannot be positively established — a missing root, an
    uninspectable component, any filesystem error — the write is refused. Absence of proof
    is refusal, never permission.
11. **Batch prevalidation.** Every destination in a write batch is resolved **before any
    byte is written**, so a rejected batch leaves no partially applied artifact.
12. **One enforcement path for agent and founder gate.** Agent code generation, critique
    repair, and founder/gate edits are all externally supplied paths, and all pass through
    the same primitive. The human gate is not more trusted than the agent here.

### Consequences, not separate rules

- **No indirect reach.** Protected surfaces (`decisions/`, `AGENTS.md`, `policies/`,
  `loops/`, `seats/`, ledgers, config) live outside the capability root, so rules 6-9 put
  them out of reach with no denylist involved.
- **Checks are not durable.** A containment result describes the filesystem at the moment
  of the check. See the TOCTOU boundary below — and the table that separates it from
  rule 6.

### Blueprint obligation → contract rule

| Required obligation | Rule |
|---|---|
| repository-root canonicalization | 2 |
| capability-root lexical identity | 3 |
| capability-root existence | 4 |
| capability-root directory type | 5 |
| capability-root non-symlink status | 6 |
| descendant component non-symlink status | 7 |
| lexical containment | 8 |
| canonical containment | 9 |
| fail-closed behaviour | 10 |
| batch prevalidation | 11 |
| shared agent and founder-gate enforcement | 12 |

## Explicitly insufficient

```ts
if (path.startsWith("product/")) { /* allow */ }      // the original defect
if (path.includes("..")) { /* reject */ }             // still no canonical proof
const root = await realpath(`${repo}/product`);       // the second defect
```

The first is satisfied by `product/../decisions/ADR-000.md`. The second blocks that
string but proves nothing about symlinks or canonical resolution, and rejects
legitimate names containing two dots.

The third is subtler and was caught at the PREZ merge gate, not by the first
implementation. Canonicalizing the capability root **defines the boundary by
following a link the attacker may control**: with `product -> decisions`, `realpath`
returns `<repo>/decisions`, every descendant check then passes honestly, and
`product/ADR-000.md` overwrites the charter while the run reports
`outcome: "shipped"`. With `product -> /somewhere/else`, the same path writes outside
the repository entirely. A capability root is a **claim to verify**, never a value to
resolve.

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
  rejected outright rather than resolved. This includes the **capability root
  itself**.
- The remaining exposure requires an attacker that already has local write access to
  the repository during the run — at which point the agent boundary is not the
  relevant control, and `docs/agent-protocol.md`'s existing requirement to run in an
  isolated, disposable worker applies.

### A symlinked capability root is NOT the TOCTOU residual

The two are easy to conflate and must be kept distinct, because one is closed and one
is not:

| | Symlinked capability root | TOCTOU residual |
|---|---|---|
| Condition | **Pre-existing** on disk before the run | A swap **during** the run |
| Detectable before the write? | **Yes**, deterministically | No — that is the definition of the race |
| Arrives via | a clone, a restore, any earlier local write | a concurrent local process |
| Status | **CLOSED** by rule 6, tested by four classes | **OPEN**, stated above |

The first implementation treated the first row as if it were the second — it
canonicalized the root and deferred to the TOCTOU disclosure. That was wrong: a
condition observable before the write is in scope for the check that precedes the
write.

## Test mapping

| Rule | Tests |
|---|---|
| 1 | absolute path; NUL-containing path |
| 2 | positive control: a legitimate write succeeds when the repository is reached through an operator-owned parent alias |
| 3 | implicit in every case — the capability root never varies with the payload |
| 4, 5 | capability root as a file; capability root unavailable (fail-closed path) |
| 6 | capability root symlinked to a protected directory; to the repository root; out of the repository; the same through the founder gate |
| 7 | symlinked directory inside `product/`; symlink to the repository root; existing symlink leaf |
| 8 | in-repository traversal; nested traversal; constitution traversal; root escape; the capability root as a destination |
| 9 | covered jointly by the symlink walk and the post-walk containment re-check |
| 10 | covered by the fail-closed error paths in the primitive |
| 11 | a denied batch writes no file, asserted by the protected-surface hashes and the empty outside directory |
| 12 | founder gate edit path — both the traversal and the symlinked-root variants |
| — | legitimate control; nested legitimate subdirectory; terminal-eval preservation |
