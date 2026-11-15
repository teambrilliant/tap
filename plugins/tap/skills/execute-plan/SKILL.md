---
name: execute-plan
description: >-
  Execute an approved plan from tap/plans/ to completion — every phase, every check, every
  acceptance criterion — and stop only when DONE or BLOCKED. Use when someone says "execute the plan",
  "implement the plan", "build it" after a plan was approved, "start building", or points at a file in
  tap/plans/. Medium/large work without a plan → /tap:write-plan first.
---

# Execute Plan

Carry an approved plan through to working, verified code. The plan is a contract: you either satisfy it or show exactly why it can't be satisfied.

## Input

A plan in `tap/plans/` (from `/tap:write-plan`). No plan and the work is medium/large → write one first. No plan and the work is small and clear → state the acceptance criteria in one line each, then run under the same contract.

## The Contract

Approval of the plan is the only gate, and a plan marked `**Gate:** auto` in a repo with an autonomy policy already has it. From then on you own delivering it, and a run ends in exactly one of two states:

**DONE** — every phase implemented; every phase check green; full test suite, typecheck and lint with no new failures against the baseline you recorded at the start; every acceptance criterion verified with cited evidence. For UI criteria, that means you ran `/tap:qa-test` yourself and it passed.

**BLOCKED** — the contract can't be satisfied without something only the user can provide:
- a permission, credential, or access you don't have (and the plan's pre-flight blockers didn't cover)
- a harness that can't be made runnable by you — a check needs a human step with no bypass
- a plan premise that turns out false, with no resolution that stays within the plan's intent
- a risky or irreversible action that needs explicit confirmation: anything against shared, staging or prod environments, or outward-facing (pushing, opening PRs, deploying, messaging). Local/dev DB migrations, resets and seeds the plan's checks call for are in-contract.
  - In a repo with an autonomy policy (`tap/autonomy.md` on its main branch), the policy is standing authorization to push the work branch, open the PR, and merge on a `merge` verdict. Those three stop being BLOCKED reasons there. Everything else in this bullet stands.
- the same check still failing after 3 genuinely different fix attempts

Before stopping BLOCKED, finish every item that doesn't depend on the blocker.

**Everything else is yours to resolve.** Renamed symbols, moved files, different signatures, a missing import, a choice between two reasonable implementations, a scope-adjacent decision where one option clearly fits the plan's intent — decide and keep going.

### The Decisions log

Every call the plan didn't make — a departure from it, or a gap it left open — goes under `## Decisions` at the end of the plan file, as you make it. This is what the reviewer reads instead of the diff, so write it for someone who wasn't in the session:

```
## Decisions
1. When a Stripe sync fails, the job retries 3× and then gives up silently — you'd only notice from missing invoices. Plan didn't say. Alt: alert after 3 fails. (unsure)
2. Invoices are keyed by Stripe's id, so re-syncing updates rows instead of duplicating them. Plan said `uuid` pk. (sure)
```

- One line each, plain words: what happens as a concrete scenario → what the plan said (or "didn't say") → the alternative not taken → `(sure)` / `(unsure)`.
- Log what a reviewer would want to know: behavior, data shapes and storage, contracts and error behavior, dependencies, retries/timeouts, scope. Skip trivia — names, imports, file moves.
- At final verification, reorder least sure first.

### How turns end

A message without a tool call ends your turn, and the work stops there. While the contract is open, don't end a turn in any of these ways:

1. A summary of what's done that announces the next step instead of taking it.
2. An offer to continue "unless you'd prefer otherwise".
3. A list of decisions for the user when none of them blocks the remaining work — decide, log under Decisions, continue.
4. Reporting because a phase finished, a milestone landed, or the turn got long.

Status notes are welcome — put them in the same message as your next tool call. Before any message without a tool call, read the plan's checkboxes and your todo list: open items and no stated blocker means keep working. Background work whose result you depend on (test runs, sub-agents) has to finish and be read before you can call the work DONE. Long-running servers are fine — note them or stop them.

## Process

### 1. Load the contract

Read the plan completely, the shape doc it links (acceptance criteria live there), and the files each phase touches. Build a todo list: one item per phase, plus final verification and each acceptance criterion.

**The plan gate.** Read the plan's `**Gate:**` line and the repo's autonomy policy (`git fetch origin`, then `git show origin/<default-branch>:tap/autonomy.md`; format and rules in [blast-radius/references/autonomy.md](../blast-radius/references/autonomy.md)).

- `**Gate:** human` and the operator hasn't approved this plan in this session → stop, outcome "waiting at plan gate".
- Approved, or `**Gate:** auto` → create the work branch and commit the plan file alone as its first commit (`plan: <title>`). That commit is the approval record: the merge verdict compares the plan at that commit with the plan at head, so after it only ticks and `## Decisions` change in the plan file.
- No `**Gate:**` line, or no autonomy policy → the plan needs approval as before, and Ship (step 4) doesn't apply.

Resuming? Existing `[x]` marks in the plan are done — start from the first unchecked item; re-verify earlier work only if something contradicts it.

Verify the plan's **Pre-flight blockers** are cleared (key present, seed runs, auth bypass works) — plus browser MCP reachability if there's a UI layer or UI criterion. Record a baseline of the test suite, typecheck and lint. If a pre-flight item isn't in place, that's BLOCKED before any code — report it now, not after three phases. Pre-existing failures in the baseline are listed in the report, not fixed.

### 2. Execute phase by phase, layer by layer

For each phase:
1. **Implement** the changes, following existing patterns.
2. **Prove** — run the phase checks. They are agent-runnable commands; if one isn't, make it one (a script, a curl, a seeded route) rather than skipping it.
3. **Fix** until green. Don't start a layer until the layer beneath it is proven — a UI bug is never debugged on top of an unproven API.
4. **Record** — tick each check `- [x]` in the plan file as soon as it passes, before running the next one; a phase is done when all its boxes are ticked. Never tick a check that hasn't passed in this run. Update todos, log any decision.

Then move straight to the next phase.

### 3. Final verification

- Full test suite, typecheck, lint.
- Every acceptance criterion from the shape doc, each with evidence: command output, query result, or qa-test finding.
- UI criteria → run `/tap:qa-test` in agent mode. It fixes and re-tests up to its own limit; a criterion it can't get green is a BLOCKED item with its evidence.

### 4. Ship

Only in a repo with an autonomy policy that says `Delivery: pr`. Otherwise skip to the report.

1. Push the work branch, then `gh pr create`. Body: what the change does, the plan path, the Decisions log.
2. Wait for the required checks: `gh pr checks <n> --watch --required`. A verdict taken while they are pending is always `human`. A failed check → fix it within the plan, push, wait again. Still failing after 3 genuinely different attempts → hand over.
3. Start a fresh agent with no context from this session and give it one instruction: "run `/tap:blast-radius <n> verdict`". Use its outcome, never your own reading of the change. A verdict marked "autonomy override" counts as `human`.
4. `human` → hand over. Outcome: "waiting at merge gate".
5. `merge` → `gh pr merge <n> --squash --match-head-commit <sha from the verdict>` (the repo's own merge method if it doesn't allow squash). A refusal, because the head moved or a check went red since → hand over.
6. Run the policy's **Verify after merge** for the merge commit. Pass → tick the list item, if the work came from one, with a `→` link to the evidence. Fail → hand over with the failure. Never revert on your own.
7. Several repos → one PR each, in the plan's merge order. Start the next only after the one before it is merged and verified.

`Ceiling: none` → stop after step 3 with the verdict posted. Outcome: "waiting at merge gate".

**Hand over.** If the work came from a list item, change its owner to the operator (`@me`) and add a note under it with the reason and the PR or plan link, in the list grammar from `CONTRACTS.md`. Otherwise state both in the report. A handed-over PR stays open; don't close it.

### 5. Report

Decisions lead — they're what the developer hasn't seen yet.

```
Contract: DONE | BLOCKED · Outcome: merged | waiting at merge gate | waiting at plan gate | blocked · <PR or plan link>

Decisions (least sure first — full list in the plan's ## Decisions)
1. [what happens, as a scenario] — [plan said X / didn't say]. Alt: [not taken]. (unsure)
2. ...

Acceptance criteria
1. [criterion] — ✓ [evidence: command/output, qa-test result, row]
2. ...

(BLOCKED only)
Blocker: [what, with evidence]
Needed from you: [the specific thing]
Already done: [phases/items complete]
```

## Rollout discipline

Check the plan's Rollout & Rollback block before coding:

- **"Direct deploy, no flag"** — don't introduce a flag mid-implementation. If the change turns out riskier than planned (critical path, bigger blast radius), that's a premise change: log it and, if it breaks the plan's intent, BLOCKED.
- **"Flag"** — one named flag for the whole feature, at the user-perceived boundary. No per-phase or per-layer flags.
- **"Expand-contract"** — execute through expand + migrate, then end DONE with "contract phase pending deploy" in the report. The contract phase needs the expand deployed first, so it never runs in the same session; never collapse expand and contract into one PR.
- **"Both"** — flag the consumer, expand-contract the schema/API. Flags wrap code, not storage.

See [write-plan/references/rollout-primitives.md](../write-plan/references/rollout-primitives.md) for the full decision tree.

## Working guidelines

- Read before editing — full files for small ones, targeted sections for large ones.
- Follow the codebase's existing patterns; consult [references/software-design-philosophy.md](references/software-design-philosophy.md) and watch for shallow modules, information leakage, pass-through methods.
- Keep changes inside the plan's scope — no unrelated "improvements".
- Sub-agents for exploration (reading tests and related modules in parallel), not for writing the code.
- Acceptance criteria are the user's: if one looks wrong, verify what's specified and flag it in the report; don't edit it.

## Handoffs

- DONE in a repo with no autonomy policy → offer `/tap:blast-radius` for an independent review before merge: it checks the Decisions log against the diff and finds the calls it missed. With a policy, Ship already ran it.
- DONE on customer-facing work → offer `/tap:explain` on the shipped diff, seeded with the Decisions, so the developer can explain and defend what shipped.
- BLOCKED because the plan itself is wrong → `/tap:write-plan` with the evidence.
