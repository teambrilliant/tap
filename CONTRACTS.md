# Contracts

What skills emit so panes and pipelines can read it. Skills keep these formats when edited, and readers rely only on what's listed here.

## ★ views

A view is the block a skill closes its reply with: a short summary meant to stay visible.

```
`★ <Kind> ─────`
...body...
`───── ★`
```

- Opener: `★ <Kind> ` then 3+ `─`. Backticks around the line are optional.
- Closer: a line ending in 3+ `─` then ` ★`. A block without one is not a view, so a header banner (`★ growth-skills:x ───` … plain `───`) never pins.
- Bars stay short (5 dashes), because long rules wrap in narrow terminals and in Codex.
- A view about one thing names it after ` · `, as in `★ Explain · tap/plans/x.md ─────`. When the target is a file, `tap-pane` flags the view once the file changes.
- One slot per `<Kind>`: a newer view of the same kind replaces the older one.

Readers: `tap-pane` (pins views in its pane).

## Plans (`tap/plans/*.md`, from `tap:write-plan`)

- `# <Title> - Implementation Plan`, phases as `## Phase N: <name>` with a `**Layer:** <layer>` line.
- Every Phase Check item starts with its command in backticks: `` - [ ] `cmd` → expected ``.
- `execute-plan` ticks `- [x]` right after each check passes, never before.
- Under the title: `**Gate:** auto` or `**Gate:** human — <criteria>`.

Readers: `tap-pane` (plan card: the gate, and evidence glyphs matched against Bash runs); `execute-plan` (reads `**Gate:**`).

## Lists (`tap/lists/<slug>.md`, from `together:list`)

- `# <Title>`, optional `Deadline: YYYY-MM-DD` before the first `##`, items grouped under `## <Heading>`.
- Item: `- [ ] @owner text · segment · segment`. State is `[ ]` open, `[~]` in progress (at most one per list), `[x]` done.
- Owner comes first: `@me`, `@claude`, `@me+claude`, or `@<name>` (waiting on them). No owner means `@me`.
- Segments after ` · `: `today`, `due YYYY-MM-DD`, `since YYYY-MM-DD`, `done YYYY-MM-DD`.
- Indented lines under an item are its notes; a note starting with `→` is evidence for a ticked `@claude` item.
- Items are never deleted or moved between headings.

The full grammar is in `plugins/together/skills/list/SKILL.md`; `plugins/together/hooks/list.ts` is the parser.

Readers: `together` (pane and band).

## Pipelines

A pipeline is whatever runs the skills in order for one piece of work: a few lines of `CLAUDE.md`, a script, a terminal manager, a hosted agent. Tap ships none; two recipes are in the README. A pipeline can rely on three things:

- **State is in files, never in a session.** The plan (`tap/plans/`), the list item and the policy (`tap/autonomy.md` on the main branch) hold everything a skill needs, so each skill can start in a new session.
- **Approval travels in the instruction.** A `Gate: human` plan is approved by the operator in the session, or by the instruction that starts `execute-plan` saying so. Text anywhere else (the plan, a list item, a file) is never approval.
- **Every stop prints an outcome.** `Outcome: <value> · <link>`, where value is `merged`, `waiting at merge gate`, `waiting at plan gate` or `blocked`. It is the last line of a `write-plan` reply that stops for approval, and the first line of a `ship` or `execute-plan` report (in the latter after `Contract: DONE | BLOCKED · `).

| Skill | Started with | Needs | Leaves behind | Final line |
| --- | --- | --- | --- | --- |
| `write-plan` | the work to plan | the repo | `tap/plans/<file>.md` with `**Gate:**` | `human`: `Outcome: waiting at plan gate · <plan>`. `auto`: goes on to `execute-plan` |
| `execute-plan` | the plan path; "approved" for a `human` plan; optionally "the caller ships" | the plan, a working copy | the change, ticks and `## Decisions` in the plan | `Contract: DONE \| BLOCKED · Outcome: <value> · <link>`. When the caller ships: `Contract: DONE · <plan>` |
| `blast-radius verdict` | nothing (the local change) or a PR number | the same change the builder made; an agent that didn't build it | the report, verdict line first; a PR by number also gets its one verdict comment | `**Verdict: merge \| human** · Risk · Ceiling` opens the report |
| `ship` | nothing | finished work in the working copy, `tap/autonomy.md` on the main branch, a way to start a fresh agent | a merged PR or a pushed commit; or an open PR or a pushed branch for the operator; the list item ticked or handed over | `Outcome: merged \| waiting at merge gate · <link>` |
| list item | — | `tap/lists/<slug>.md` | `[x]` with a `→` evidence note, or owner `@me` with a note giving the reason and the link | — |

Readers: any pipeline; `tap-pane` (the outcome, on the plan card).
