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
const labelsOf = async (ui: { findAll: (q: { type: 'Button' }) => Promise<Found[]> }) =>
  (await ui.findAll({ type: 'Button' })).map(found => {
    const props: object = found.props ?? {}
    return 'label' in props ? String(props.label) : ''
  })
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
    world(on, filesOf('emma-launch', 'otp-outreach'))
    await start($)
    const pane = await mountPane($)
    await $.tool.call({ tool: 'Read', file_path: 'README.md' })
    expect(await textOf(pane)).not.toContain('tap/lists/emma-launch.md')
    await $.tool.call({ tool: 'Read', file_path: 'tap/lists/emma-launch.md' })
    expect(await textOf(pane)).toContain('tap/lists/emma-launch.md')
  })

  test('AC6: /together <slug> switches; an unknown slug keeps the active list', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'q4-taxes'))
    await start($)
    expect((await run($, 'q4-taxes')).text).toBe('together: q4-taxes')
    expect((await run($, 'nope')).text).toBe('together: no tap/lists/nope.md')
    const shown = await textOf(await mountPane($))
    expect(shown).toContain('○ q4 taxes')
    expect(shown).toContain('tap/lists/q4-taxes.md')
  })
})

describe('pane', () => {
  test('AC2: header, progress, today, headings with what is left, waiting, done count; done items hidden', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch'))
    await start($)
    await run($, 'emma-launch')
    const pane = await mountPane($)
    const shown = await textOf(pane)
    for (const part of ['◑ emma launch', '⚑ 12d', '▕', '7/14', '✦ today', '○ Buy domain', '◐ Update site to v3', '╶─   admin', '○ Shortlist 10 companies', '◷ waiting', '◷ neil · Pricing changes', '4d', '7 done', 'tap/lists/emma-launch.md']) {
      expect(shown).toContain(part)
    }
    expect((await labelsOf(pane)).join('\n')).toContain('╶─ ▾ outreach')
    expect((await labelsOf(pane)).join('\n')).toContain('2/4 ╴')
    expect(shown).not.toContain('Set up Stripe account')
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
    const pane = await mountPane($)
    const shown = await textsOf(pane)
    expect(shown).toContain('✦ 4 today · ◷ 4 waiting')
    expect(await labelsOf(pane)).toContain('◑ otp outreach')
    expect(shown).toContain('3/6')
    expect(await labelsOf(pane)).toContain('○ q4 taxes')
    expect(shown).toContain('0/4 ⚑ oct 31')
  })

  test('until the session touches a list, the most recently modified one is shown', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'q4-taxes', 'otp-outreach'))
    await start($)
    const pane = await mountPane($)
    const shown = await textOf(pane)
    expect(shown).toContain('tap/lists/otp-outreach.md')
    expect(await labelsOf(pane)).toContain('○ q4 taxes')
    expect(shown).not.toContain('tap/lists/q4-taxes.md')
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
    const pane = await mountPane($, 36)
    const lines = [...(await textsOf(pane)), ...(await labelsOf(pane))].filter(text => /[─▕░█]/u.test(text))
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

describe('pressing', () => {
  test('a list in the overview becomes the active one', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'q4-taxes'))
    await start($)
    await run($, 'emma-launch')
    const pane = await mountPane($)
    await pane.press({ key: `list:${listPath('q4-taxes')}` })
    const shown = await textOf(pane)
    expect(shown).toContain('tap/lists/q4-taxes.md')
    expect(await labelsOf(pane)).toContain('◑ emma launch')
  })

  test('a heading folds and unfolds its items, per list', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, filesOf('emma-launch', 'q4-taxes'))
    await start($)
    await run($, 'emma-launch')
    const pane = await mountPane($)
    await pane.press({ key: 'fold:Outreach' })
    expect(await textOf(pane)).not.toContain('Shortlist 10 companies')
    expect((await labelsOf(pane)).join('\n')).toContain('╶─ ▸ outreach')
    await run($, 'q4-taxes')
    await run($, 'emma-launch')
    expect(await textOf(pane)).not.toContain('Shortlist 10 companies')
    await pane.press({ key: 'fold:Outreach' })
    expect(await textOf(pane)).toContain('Shortlist 10 companies')
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

  test('the band toggles the pane (r, or a click); a pane behind another tab is raised, not closed', async ($, on) => {
    mock.clock(on, { now: NOW })
    const w = world(on, filesOf('emma-launch'))
    await start($)
    expect((await (await mountBand($)).find({ key: 'toggle-pane' }))?.props.hotkey).toBe('r')
    // the engine redraws the band as panes open and close: each press is on a fresh drawing
    const press = async () => (await mountBand($)).press({ key: 'toggle-pane' })
    await press()
    expect(w.placed.has('together')).toBe(true)
    await press()
    expect(w.placed.has('together')).toBe(false)
    await press()
    w.hidden.add('together')
    await press()
    expect(w.placed.has('together')).toBe(true)
    expect(w.hidden.has('together')).toBe(false)
  })

  test('a press opens with no pane call awaited first: the open stays the person\'s, placed on a narrow terminal', async ($, on) => {
    mock.clock(on, { now: NOW })
    const w = world(on, filesOf('emma-launch'))
    await start($)
    const band = await mountBand($)
    w.paneCalls.length = 0
    await band.press({ key: 'toggle-pane' })
    expect(w.paneCalls.slice(0, w.paneCalls.indexOf('open'))).not.toContain('panes')
    expect(w.placed.has('together')).toBe(true)
  })

  test('no lists: the band is what is beneath', async ($, on) => {
    mock.clock(on, { now: NOW })
    world(on, new Map())
    await start($)
    expect(await textsOf(await mountBand($))).toEqual(['BELOW'])
  })
})
