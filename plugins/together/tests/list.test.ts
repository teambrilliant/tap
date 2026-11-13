import { describe, expect, test } from 'claude-code/testing'

import { parseList, pieOf, summarize } from '../hooks/list'
import { FORMAT_EXAMPLE, LISTS } from './fixtures/fixtures.gen'

const TODAY = '2026-10-08'
const fixture = (name: string) => parseList(LISTS[name] ?? '')

describe('parseList', () => {
  test('title, deadline and headings in file order', async () => {
    const list = fixture('emma-launch')
    expect(list?.title).toBe('Emma launch')
    expect(list?.deadline).toBe('2026-10-20')
    expect(list?.headings.map(heading => heading.name)).toEqual(['Admin', 'Website', 'Outreach'])
  })

  test('owners: me, claude, together, others; no owner means me', async () => {
    const list = parseList('# T\n- [ ] @me a\n- [ ] @Claude b\n- [ ] @me+claude c\n- [ ] @neil d\n- [ ] e')
    expect(list?.headings[0]?.items.map(item => item.owner)).toEqual([
      { kind: 'me', name: 'me' },
      { kind: 'claude', name: 'claude' },
      { kind: 'together', name: 'me+claude' },
      { kind: 'other', name: 'neil' },
      { kind: 'me', name: 'me' },
    ])
    expect(list?.headings[0]?.name).toBe('')
  })

  test('an owner written last still counts', async () => {
    const item = parseList('# T\n- [ ] Confirm pricing @neil · since 2026-10-08')?.headings[0]?.items[0]
    expect(item).toMatchObject({ text: 'Confirm pricing', owner: { kind: 'other', name: 'neil' }, since: '2026-10-08' })
  })

  test('states, dated segments, unknown segments stay in the text', async () => {
    const items = parseList('# T\n- [~] @claude a\n- [x] @me b · done 2026-10-01\n- [ ] @me c · today · due 2026-10-09 · v2 · since 2026-10-02')?.headings[0]?.items
    expect(items?.map(item => item.state)).toEqual(['doing', 'done', 'open'])
    expect(items?.[1]?.doneOn).toBe('2026-10-01')
    expect(items?.[2]).toMatchObject({ text: 'c · v2', isToday: true, due: '2026-10-09', since: '2026-10-02' })
  })

  test('indented lines are notes of the item above', async () => {
    const items = fixture('emma-launch')?.headings[1]?.items
    expect(items?.[0]?.notes).toEqual(['→ thoughts/research/emma-site-audit.md'])
    expect(items?.[2]?.notes).toEqual(['draft: site/copy-v3.md'])
  })

  test('a file with neither title nor items is not a list', async () => {
    expect(fixture('malformed')).toBeUndefined()
    expect(parseList('- [ ] @me lone item')?.title).toBe('Untitled')
  })

  test('the example in SKILL.md parses', async () => {
    const list = parseList(FORMAT_EXAMPLE)
    expect(list?.title).toBe('Emma launch')
    expect(list?.headings.flatMap(heading => heading.items)).toHaveLength(6)
  })
})

describe('summarize', () => {
  test('counts, pie, days left', async () => {
    const list = fixture('emma-launch')
    if (list === undefined) throw new Error('fixture')
    expect(summarize(list, TODAY)).toMatchObject({ done: 7, total: 14, pie: '◑', daysLeft: 12 })
  })

  test('today: tagged, doing or due; next is the first of mine', async () => {
    const list = fixture('emma-launch')
    if (list === undefined) throw new Error('fixture')
    const summary = summarize(list, TODAY)
    expect(summary.today.map(item => item.text)).toEqual(['Buy domain', 'Update site to v3', 'Review copy w/ Alexa'])
    expect(summary.next?.text).toBe('Buy domain')
    expect(summary.doing?.text).toBe('Update site to v3')
  })

  test('waiting: age in days, stale after 3', async () => {
    const list = fixture('emma-launch')
    if (list === undefined) throw new Error('fixture')
    expect(summarize(list, TODAY).waiting.map(w => [w.item.owner.name, w.ageDays, w.isStale])).toEqual([
      ['neil', 4, true],
      ['alexa', 1, false],
    ])
  })

  test('overdue: due strictly before today', async () => {
    const list = fixture('q4-taxes')
    if (list === undefined) throw new Error('fixture')
    const summary = summarize(list, TODAY)
    expect(summary.overdue.map(item => item.text)).toEqual(['Gather receipts'])
    expect(summary.today.map(item => item.text)).toEqual(['Gather receipts'])
    expect(summary.waiting[0]?.ageDays).toBeNull()
  })

  test('pie steps', async () => {
    expect([pieOf(0, 0), pieOf(0, 4), pieOf(1, 4), pieOf(2, 4), pieOf(3, 4), pieOf(4, 4)]).toEqual(['○', '○', '◔', '◑', '◕', '●'])
  })
})
