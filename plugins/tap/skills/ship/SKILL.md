---
name: ship
description: Ship finished work in a repo that has an autonomy policy (`tap/autonomy.md`) — a fresh agent's verdict, then a PR and merge, or a commit and push to main, or a hand-over to a human with the reason. Use when someone says "ship it", "ship this", "get this merged", "push this", or when work is complete in a repo with `tap/autonomy.md`. Works on any finished work, with or without a plan.
---

# Ship

Take finished work to the main branch as far as the repo's autonomy policy allows, or hand it to a human with the reason. How the work was made doesn't matter: a tap plan, another tool, or by hand.

## Input

Finished work in the current working copy: what was asked for is done, and tests, typecheck and lint are no worse than the repo's baseline. If it isn't finished, say what is missing and stop. Ship delivers work; it doesn't complete it.

## Process

### 1. Read the policy

```
git fetch origin
git show origin/<default-branch>:tap/autonomy.md
```

Format and rules: [blast-radius/references/autonomy.md](../blast-radius/references/autonomy.md).

- No such file → the repo has no gates. Deliver the way the repo's own instructions say (commit to main, or open a PR), and nothing below applies.
- Otherwise the policy is standing authorization for exactly what this skill does: push a branch, open a PR, and merge or push to the main branch on a `merge` verdict.

### 2. Get the verdict

The verdict is never yours. Start a fresh agent with no context from this session and give it one instruction: "run `/tap:blast-radius verdict`" in this working copy. Use what it returns, unchanged. A verdict marked "autonomy override" counts as `human`.

Anything that changes after the verdict voids it: get a new one.

### 3. Deliver, by the policy's `Delivery:`

**`Delivery: pr`**

1. If you are on the main branch, create a branch. Commit the work.
2. Get the verdict (step 2). It reads the branch against the main branch.
3. Push the branch and `gh pr create`. The body is the fresh agent's report, unchanged, verdict line first.
4. Wait for the required checks: `gh pr checks <n> --watch --required`. A failed check → fix it, commit, get a new verdict, push, and replace the description (`gh pr edit <n> --body-file <file>`). Still failing after 3 genuinely different attempts → hand over.
5. `human` → hand over. The PR stays open.
6. `merge`, and the checks passed → `gh pr merge <n> --squash --match-head-commit <sha from the verdict>` (the repo's own merge method if it doesn't allow squash). A refusal, because the head moved or a check went red since → hand over.
7. Verify (step 4).

**`Delivery: main`**

1. Stage exactly what you will commit (`git add <paths>`, never `git add -A` over files that aren't yours), and don't commit on the main branch before the verdict. Get the verdict (step 2). It reads what is staged and runs the policy's required checks itself. Files left unstaged or untracked are not judged and must not be committed.
2. `merge` → commit what is staged and nothing else, ending the message with the verdict line and its reasons, and push to the main branch. Never force-push. If the push is refused because the main branch moved, or a commit hook changed files, take the main branch in the way the repo does and get a new verdict.
3. `human`, or anything else short of pushed → commit what is staged on a new branch, push it, and hand over with `https://github.com/<owner>/<repo>/compare/<default-branch>...<branch>`. Nothing is committed on the main branch.
4. Verify (step 4).

`Ceiling: none` → every verdict is `human`: deliver as far as the open PR or the pushed branch, and hand over.

### 4. Verify

Run the policy's **Verify after merge** for the merge commit or the pushed commit.

- Pass → if the work came from a list item, tick it and add a `→` note with the link to the evidence.
- Fail → hand over with the failure. Never revert on your own.

### 5. Hand over

State the reason and the link (the PR, or the compare link). If the work came from a list item, change its owner to the operator (`@me`) and add a note under it with both, in the list grammar from `CONTRACTS.md`. A handed-over PR or branch stays; don't close or delete it.

### 6. Report

```
Outcome: merged | waiting at merge gate · <commit, PR or compare link>
<the verdict line>
<for `human`: each reason>
<verification: what ran and its result>
```

## Boundaries

- Never gives the verdict itself, and never edits what the fresh agent returned
- Never force-pushes, never reverts, never edits `tap/autonomy.md`
- A refusal (a permission denial, branch protection, a failed merge) is a hand-over, never something to work around
- Does NOT finish unfinished work, and does NOT run QA (that's `execute-plan` / `qa-test`)
