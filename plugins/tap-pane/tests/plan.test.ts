import { describe, expect, test } from 'claude-code/testing'

import { outcomeOf, parsePlan, progressOf, shortName, ticksOf } from '../hooks/plan'
import { PLANS } from './fixtures/fixtures.gen'

describe('parsePlan', () => {
  test('phases and Final Verification, with their checks; other sections ignored', async () => {
    const plan = parsePlan(PLANS.midrun)
    expect(plan?.title).toBe('Billing invoices')
    expect(plan?.phases.map(phase => [shortName(phase), phase.layer, phase.items.length])).toEqual([
      ['P1', 'outbound I/O, State', 2],
      ['P2', 'Function', 2],
      ['P3', 'UI', 1],
      ['Final', null, 2],
    ])
  })

  test('the command is the backticked span an item starts with; prose items have none', async () => {
    const final = parsePlan(PLANS.midrun)?.phases.at(-1)
    expect(final?.items.map(item => item.command)).toEqual(['pnpm test', null])
  })

  test('current phase is the first with an unticked item; resume is its first unticked item', async () => {
    const plan = parsePlan(PLANS.midrun)
    const progress = plan === undefined ? undefined : progressOf(plan)
    expect(progress?.current?.name).toBe('Phase 2: syncInvoices')
    expect(progress?.resume?.command).toBe('pnpm vitest sync-replay.test.ts')
    expect([progress?.done, progress?.total]).toEqual([3, 7])
  })

  test('ticks are the texts of checked items', async () => {
    const plan = parsePlan(PLANS.midrun)
    expect(plan === undefined ? [] : ticksOf(plan)).toHaveLength(3)
  })

  test('the tick fixture parses with nothing ticked', async () => {
    const plan = parsePlan(PLANS.tick)
    expect(plan === undefined ? undefined : progressOf(plan).done).toBe(0)
    expect(plan?.phases).toHaveLength(2)
  })

  test('text that is not a plan parses to undefined', async () => {
    expect(parsePlan('just prose\n- [ ] a box')).toBeUndefined()
  })
})

describe('gate', () => {
  test('human with its criteria, read above the first section only', async () => {
    expect(parsePlan(PLANS.gated)?.gate).toEqual({ kind: 'human', criteria: 'user-visible change, new dependency' })
  })

  test('auto has no criteria', async () => {
    expect(parsePlan('# T\n\n**Gate:** auto\n\n## Phase 1: p\n- [ ] `x` → ok')?.gate).toEqual({ kind: 'auto', criteria: null })
  })

  test('a plan without a gate line has none', async () => {
    expect(parsePlan(PLANS.midrun)?.gate).toBeNull()
  })
})

describe('outcomeOf', () => {
  test('each value, from a ship report, an execute-plan report and a write-plan stop', async () => {
    expect(outcomeOf('Outcome: merged · abc1234\n**Verdict: merge**')).toBe('merged')
    expect(outcomeOf('Contract: DONE · Outcome: waiting at merge gate · https://example.test/pr/1')).toBe('waiting at merge gate')
    expect(outcomeOf('───── ★\n\nOutcome: waiting at plan gate · tap/plans/x.md')).toBe('waiting at plan gate')
    expect(outcomeOf('**Contract: BLOCKED · Outcome: blocked** · tap/plans/x.md')).toBe('blocked')
  })

  test('the last one in a reply wins', async () => {
    expect(outcomeOf('Outcome: waiting at merge gate · a\nlater\nOutcome: merged · b')).toBe('merged')
  })

  test('a template listing the choices, an unknown value and plain prose are not outcomes', async () => {
    expect(outcomeOf('Outcome: merged | waiting at merge gate · <link>')).toBeNull()
    expect(outcomeOf('Outcome: shipped · x')).toBeNull()
    expect(outcomeOf('the outcome was fine')).toBeNull()
  })
})
