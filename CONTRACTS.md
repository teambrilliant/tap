# Contracts

What skills emit so mods can read it. Skills keep these formats when edited, and mods parse only what's listed here.

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

Readers: `tap-pane` (plan card, with evidence glyphs matched against Bash runs).

## Lists (`tap/lists/<slug>.md`, from `together:list`)

- `# <Title>`, optional `Deadline: YYYY-MM-DD` before the first `##`, items grouped under `## <Heading>`.
- Item: `- [ ] @owner text · segment · segment`. State is `[ ]` open, `[~]` in progress (at most one per list), `[x]` done.
- Owner comes first: `@me`, `@claude`, `@me+claude`, or `@<name>` (waiting on them). No owner means `@me`.
- Segments after ` · `: `today`, `due YYYY-MM-DD`, `since YYYY-MM-DD`, `done YYYY-MM-DD`.
- Indented lines under an item are its notes; a note starting with `→` is evidence for a ticked `@claude` item.
- Items are never deleted or moved between headings.

The full grammar is in `plugins/together/skills/list/SKILL.md`; `plugins/together/hooks/list.ts` is the parser.

Readers: `together` (pane and band).
