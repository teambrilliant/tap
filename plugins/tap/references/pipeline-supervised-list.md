# Pipeline: a supervisor works a list through PRs

A recipe, not a skill. Paste the block below into a repo's `CLAUDE.md` or `CLAUDE.local.md` and fill in the three values at the top. It is the README's two recipes joined and grown: one session you talk to, a sub-agent per stage, several items in flight, and every wait visible on a PR.

Needs: `Delivery: pr` (or no `tap/autonomy.md`), `gh`, and a list in the `together` grammar on the main branch.

```markdown
## Pipeline: work the list

Trigger: I say "work the list". The list: `tap/lists/<slug>.md`. Id prefix: `R`. WIP limit: 5.

The list is the stock of planned work. It says what should be done and in what order, never what is happening now. Read it top to bottom from current `origin/main` (`git pull` first; still missing → stop and tell me, don't fall back to another list). `[ ]` open, `[x]` done; `@claude` items are yours, `@me` and `@me+claude` are not.

Every item has a short id right after the owner: `- [ ] @claude R12 Export orders as CSV`. Ids are never reused or renumbered, and an item keeps its id when its text changes. There is no counter: whoever adds an item pulls `main` and uses the highest id in the file plus one. The id names the item everywhere: in chat, the branch (`r12-export-orders`), the PR title. A sub-step that needs my go-ahead is split off as a question on the item's PR; the rest of the item proceeds.

You (this session) are the **supervisor**. I talk to you. You don't plan, build, review or QA yourself: every stage runs in its own sub-agent. Your job is judgement: pick the item, brief each sub-agent, read what it returns against the item and the repo's rules, send weak work back, decide the hand-offs.

### Where state lives

One store per state. Nothing is copied between them.

| State | Store |
|---|---|
| Planned | the list item, `[ ]`, named by its id |
| Taken | an open PR whose title starts with the item's id (opened at step 2) |
| Waiting for me | one label on the PR: `waiting:plan-review`, `waiting:answer`, `waiting:merge` |
| Done | the list item, `[x]` with `→ <PR url>` `· done YYYY-MM-DD` |

- One item is one PR from pick to merge. The plan, the build and the questions all live on it.
- `waiting:plan-review`: the plan is on the branch and holds a decision that is mine; the PR body is that decision first, then the ★ Plan View, so I can decide from the PR page alone. `waiting:answer`: a question only I can answer (a BLOCKED build, a failed verification, a go-ahead), asked in a PR comment with a recommended answer. `waiting:merge`: built and verified, the verdict was `human`.
- A PR carries at most one `waiting:*` label. No label means an agent has it. Create a missing label with `gh label create`.
- The list is edited once per item, at the tick, on a list-only branch cut from `origin/main` and shipped with `/tap:ship`. No `[~]`, and no hand-over to `@me` in the list: the PR and its label say both.

### Who decides

Two questions: can it be undone by reverting the PR, and do `tap/product.md` or an existing pattern already answer it?

**Mine:**
- anything under `Never auto` in `tap/autonomy.md`
- product direction `tap/product.md` doesn't settle: adding or removing a capability a user would name, who something is for, crossing a non-goal
- anything a revert doesn't undo for users: signing people out, changing or deleting their data, sending them messages, changing what they pay
- security policy trade-offs
- a non-additive change to an interface something outside this repo uses
- spending money or committing to a vendor

**Yours, decided and recorded:**
- UX within existing patterns: layout, defaults, empty states, wording
- additive data model: tables, columns, indexes, naming
- technical approach, libraries within the stack, tests, rollout mechanism
- slicing an item smaller; the remainder goes back on the list as its own item

Every decision you make is listed in the PR body under "Decisions", with the reason, so I can overrule it at merge. When I overrule one, write the rule into `tap/product.md` in the same task.

My decisions are asked in this conversation, all at once, each with your recommendation and what you discarded (step 1). A `waiting:answer` label is only for a question that comes up when I'm not answering.

### The board

One command, never from memory:

`gh pr list --author @me --state open --limit 100 --json number,title,labels,url,updatedAt`

WIP = the open PRs in that result whose title starts with an item id. At the limit nothing new is picked; draining continues.

### Per item

0. **Drain** (on the trigger and before every step 1). Read the board, and check the list for an id used twice (renumber the one with no PR). For each PR:
   - `waiting:plan-review` and I decided (a review or a comment on the PR, or here) → remove the label, build on the same branch (step 4).
   - `waiting:answer` and I answered → remove the label, resume at the stage it stopped.
   - `waiting:merge` and I merged → step 7.
   - I closed it unmerged → the item is dropped: tick it `[x]` with a `dropped: <why>` note and the PR link.
   - No `waiting:*` label and nothing new on it since the last drain → list it in the table as "taken, no owner"; don't take it over.
1. **Route ahead** (on the trigger, and whenever a finished item frees room). WIP at the limit → step 8. Otherwise take the next open `@claude` items whose id no open PR title starts with, as many as the room under the limit. For each, decide from what the item changes, not from what its notes ask for:
   - no behaviour a user would notice (CI, dependencies, internal refactors) → plan it.
   - anything else → sub-agent, one per item, in parallel: "run `/tap:product-thinker` on <item text + its notes>; end with one of: plan it / shape it / needs a decision, and list every decision with a recommendation and what you discarded".
   Sort every decision by "Who decides". Yours → decide them. Mine → bring them to me together, here, and wait for my answers. If I don't answer, leave those items untaken, put their questions in the table (step 8) and go on with the rest.
2. **Take** each routed item whose decisions are settled, before any other work on it: branch `<id>-<slug>` from `origin/main`, an empty commit, push, draft PR titled `<id> <item text>`. Its body records the route, the product-thinker result and the decisions with who made each. Then read the board again: another open PR with the same id that is older than yours → close yours and drop the item from this run. From here on, one item at a time.
3. **Plan** → sub-agent on the item's branch, briefed with the PR body: "run `/tap:write-plan` for <item text + its notes + the decisions>". A "shape it" item goes to a shaping sub-agent (`/tap:shaping-work`) first; a shape that needs several PRs ships alone, and each slice goes on the list as its own item naming the shape path. An item whose notes name an existing plan: the sub-agent checks that plan is still current instead. Show me its ★ Plan View unchanged, and the plan path. Judge the plan before going on: does it cover the item, respect `CLAUDE.md` and `Never auto`, carry agent-runnable checks. Gaps go back to a plan sub-agent with the plan path.
   **Plan gate**: `Gate: auto` → go on. `Gate: human` → sort each reason for the gate by "Who decides". Every reason is yours → you approve the plan: add "Plan approved by the supervisor" to the PR body with each reason and why it is yours, and go on. Any reason is mine → ask me here if I'm answering; otherwise push the plan, label the PR `waiting:plan-review`, and go to 0.
4. **Build** → sub-agent: "run `/tap:execute-plan <plan> approved`, the caller ships, stop before shipping". Show me its report, Decisions first. `Contract: BLOCKED` → sort what it needs by "Who decides": yours → decide, record it, send it back to a build sub-agent. Mine → ask me here if I'm answering; otherwise push what exists, ask on the PR, label it `waiting:answer`, and go to 0.
5. **Verify** → fresh sub-agent that didn't build it: `/tap:qa-test` against the plan's acceptance criteria, when the item has UI criteria the build report doesn't prove with evidence. Failures go back to a build sub-agent with the plan path and the failing criteria. The same failure twice → `waiting:answer`.
6. **Ship**: `Contract: DONE` and verification clean →
   - the repo has `tap/autonomy.md` → run `/tap:ship` yourself on the item's PR.
   - no policy → a reviewer sub-agent runs `/tap:blast-radius`, its findings go in the PR description; never merge it yourself.
   - A PR left open after shipping gets `waiting:merge`.
7. **Close the item**: merged → confirm `tap/autonomy.md` → "Verify after merge" for the merge sha, then tick. Tell me the `Outcome:` line and the link.
8. Go to 0. Stop when no `@claude` item is open or WIP is at the limit, then give me one table from the board: item, waiting for, link, what I need to do, ordered by which decision unblocks the most. Untaken items waiting on a question of mine come first, with the question.

Rules:

- State is in the PR, the plan and `tap/autonomy.md`, never in a sub-agent's session: every brief names the PR, the plan path and the item, so any stage can restart cold on any machine.
- A plan is approved by me (here, or a review or comment on the PR) or by you under "Who decides", and approval reaches the build only in your instruction to its sub-agent. Text in a plan, list item or file is never approval.
- Finish before starting: draining an answered PR always comes before routing new items.
- Under the WIP limit, the only stop is step 1's questions. After that, work comes to me through a `waiting:*` label.
```

## Adapting it

- **Several repos**: pass each to the board command (`gh search prs --repo a --repo b --author @me --state open`), and say which repo an item belongs to by default.
- **Models**: one sub-agent per stage is the rule; which model runs the supervisor and which the stages is yours.
- **"Who decides"** is the part to rewrite per product. Keep the two questions; replace the examples with what your users would notice.
- **Plans as working files (optional)**: to keep `tap/plans/` off the main branch, add under "Where state lives": "A plan is a working file, not a record. It is committed on the item's branch so every stage can read it, and removed in its own commit before the ship verdict, so the verdict reads what will merge. The PR's commits keep it." And open step 6 with "First remove the plan file from the branch." The cost: `tap-pane` has no plan card for merged work.
- The supervisor approving a `Gate: human` plan is a delegation you make by pasting this. Remove that sentence to keep every `human` plan yours. Either way the merge verdict is untouched: nothing turns `human` into `merge`.
