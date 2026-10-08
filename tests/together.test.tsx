import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { LISTS } from './fixtures/fixtures.gen'
import { listPath, world } from './world'

const NOW = Date.parse('2026-10-08T12:00:00')
const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: true, columns: 160 }
const SPINNER = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Update site to v3/u

const filesOf = (...slugs: string[]) => new Map(slugs.map(slug => [listPath(slug), LISTS[slug] ?? '']))
const paneProps = (bodyColumns: number): RenderPropsOf['Pane'] => ({ title: 'together', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} })
const BAND_PROPS: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} }

async function start($: Engine) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}
const run = ($: Engine, args: string) => $.command.run({ command: 'together', args, origin: ORIGIN, presentation: PRESENTATION })
const submit = ($: Engine) => $.prompt.submit({ text: 'go', wait: false, origin: ORIGIN })
const complete = ($: Engine) => $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
const mountPane = ($: Engine, columns = 72) => $.ui.mount({ plugin: 'together', surface: 'terminal', component: 'Pane', requestId: 'together', props: paneProps(columns) })
const mountBand = ($: Engine) => $.ui.mount({ plugin: 'together', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

type Found = { text?: string; props?: object }
const textsOf = async (ui: { findAll: (q: { type: 'Text' }) => Promise<Found[]> }) => (await ui.findAll({ type: 'Text' })).map(found => found.text ?? '')
const textOf = async (ui: { findAll: (q: { type: 'Text' }) => Promise<Found[]> }) => (await textsOf(ui)).join('\n')
const colorOf = async (ui: { findAll: (q: { type: 'Text' }) => Promise<Found[]> }, pattern: RegExp) => {
  const found = (await ui.findAll({ type: 'Text' })).find(text => pattern.test(text.text ?? ''))
  const props: object = found?.props ?? {}
  return 'color' in props ? props.color : undefined
}

describe('hooks', () => {
  test('AC6: writing a list makes it active and opens the pane', async ($, on) => {
    mock.clock(on, { now: NOW })
    const w = world(on, filesOf('emma-launch'))
    await start($)
    await $.tool.call({ tool: 'Write', file_path: listPath('emma-launch'), content: LISTS['emma-launch'] ?? '' })
    expect(w.placed.has('together')).toBe(true)
    expect(await textOf(await mountPane($))).toContain('◑ emma launch')
  })

  test('AC6: a relative Read activates; other files do not', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch'))
    await start($)
    const pane = await mountPane($)
    await $.tool.call({ tool: 'Read', file_path: 'README.md' })
    expect(await textOf(pane)).not.toContain('thoughts/lists/emma-launch.md')
    await $.tool.call({ tool: 'Read', file_path: 'thoughts/lists/emma-launch.md' })
    expect(await textOf(pane)).toContain('thoughts/lists/emma-launch.md')
  })

  test('AC6: /together <slug> switches; an unknown slug keeps the active list', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'q4-taxes'))
    await start($)
    expect((await run($, 'q4-taxes')).text).toBe('together: q4-taxes')
    expect((await run($, 'nope')).text).toBe('together: no thoughts/lists/nope.md')
    const shown = await textOf(await mountPane($))
    expect(shown).toContain('○ q4 taxes')
    expect(shown).toContain('thoughts/lists/q4-taxes.md')
  })
})

describe('pane', () => {
  test('AC2: header, progress, today, headings with what is left, waiting, done count; done items hidden', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch'))
    await start($)
    await run($, 'emma-launch')
    const shown = await textOf(await mountPane($))
    for (const part of ['◑ emma launch', '⚑ 12d', '▕', '7/14', '✦ today', '○ Buy domain', '◐ Update site to v3', '╶─ outreach', '2/4 ╴', '○ Shortlist 10 companies', '◷ waiting', '◷ neil · Pricing changes', '4d', '7 done', 'thoughts/lists/emma-launch.md']) {
      expect(shown).toContain(part)
    }
    expect(shown).not.toContain('Set up Stripe account')
    expect(shown).not.toContain('╶─ admin')
  })

  test('AC3: doing is cyan, overdue red, stale waiting yellow', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'q4-taxes'))
    await start($)
    await run($, 'emma-launch')
    const pane = await mountPane($)
    expect(await colorOf(pane, /Update site to v3/u)).toBe('cyan')
    expect(await colorOf(pane, /neil · Pricing/u)).toBe('yellow')
    expect(await colorOf(pane, /alexa · Copy feedback/u)).toBeUndefined()
    await run($, 'q4-taxes')
    expect(await colorOf(pane, /Gather receipts/u)).toBe('red')
  })

  test('AC4: other lists one line each, totals across all lists', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'otp-outreach', 'q4-taxes'))
    await start($)
    await run($, 'emma-launch')
    const shown = await textsOf(await mountPane($))
    expect(shown).toContain('✦ 4 today · ◷ 4 waiting')
    expect(shown).toContain('◑ otp outreach')
    expect(shown).toContain('3/6')
    expect(shown).toContain('○ q4 taxes')
    expect(shown).toContain('0/4 ⚑ oct 31')
  })

  test('AC5: no active list shows the overview; no lists shows the empty state', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('otp-outreach'))
    await start($)
    const shown = await textOf(await mountPane($))
    expect(shown).toContain('◑ otp outreach')
    expect(shown).not.toContain('✦ today\n')
  })

  test('AC5: empty state', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, new Map())
    await start($)
    expect(await textOf(await mountPane($))).toContain('no lists yet · /together:list to start')
  })

  test('AC8: at 36 columns no drawing line runs past the pane', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'otp-outreach'))
    await start($)
    await run($, 'emma-launch')
    const lines = (await textsOf(await mountPane($, 36))).filter(text => /[─▕░█]/u.test(text))
    expect(lines.length).toBeGreaterThan(2)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(36 - 4)
  })

  test('AC9: a [~] item spins while a turn runs; ◐ once it completes', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch'))
    await start($)
    await run($, 'emma-launch')
    const pane = await mountPane($)
    await submit($)
    await clock.advance(360)
    expect(await textOf(pane)).toMatch(SPINNER)
    await complete($)
    const shown = await textOf(pane)
    expect(shown).not.toMatch(SPINNER)
    expect(shown).toContain('◐ Update site to v3')
  })
})

describe('band', () => {
  test('AC7: one line under what is drawn beneath', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch'))
    await start($)
    await run($, 'emma-launch')
    const shown = await textsOf(await mountBand($))
    expect(shown).toContain('BELOW')
    expect(shown).toContain('◑ emma launch 7/14 · next: Buy domain (you) · ◷ neil 4d')
  })

  test('no active list: the band is what is beneath', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch'))
    await start($)
    expect(await textsOf(await mountBand($))).toEqual(['BELOW'])
  })
})
