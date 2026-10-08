export type Owner = { kind: 'me' | 'claude' | 'together' | 'other'; name: string }
export type Item = {
  text: string
  owner: Owner
  state: 'open' | 'doing' | 'done'
  isToday: boolean
  due: string | null
  since: string | null
  doneOn: string | null
  notes: string[]
}
export type Heading = { name: string; items: Item[] }
export type List = { title: string; deadline: string | null; headings: Heading[] }

const TITLE = /^# (.+?)\s*$/u
const DEADLINE = /^Deadline:\s*(\d{4}-\d{2}-\d{2})\s*$/iu
const HEADING = /^## (.+?)\s*$/u
const ITEM = /^- \[( |x|X|~)\] (.*)$/u
const NOTE = /^ {2,}(\S.*?)\s*$/u
const OWNER = /^@([a-z0-9][a-z0-9+_.-]*)\s+(.*)$/iu
const TRAILING_OWNER = /^(.*?)\s+@([a-z0-9][a-z0-9+_.-]*)$/iu
const DATED = /^(due|since|done) (\d{4}-\d{2}-\d{2})$/u
const SEGMENT = ' · '

function ownerOf(name: string): Owner {
  const lower = name.toLowerCase()
  if (lower === 'me') return { kind: 'me', name: lower }
  if (lower === 'claude') return { kind: 'claude', name: lower }
  if (lower === 'me+claude' || lower === 'claude+me') return { kind: 'together', name: 'me+claude' }
  return { kind: 'other', name: lower }
}

function itemOf(mark: string, body: string): Item {
  const [head = '', ...segments] = body.split(SEGMENT)
  const leading = OWNER.exec(head.trim())
  const trailing = leading === null ? TRAILING_OWNER.exec(head.trim()) : null
  const item: Item = {
    text: '',
    owner: ownerOf(leading?.[1] ?? trailing?.[2] ?? 'me'),
    state: mark === '~' ? 'doing' : mark === ' ' ? 'open' : 'done',
    isToday: false,
    due: null,
    since: null,
    doneOn: null,
    notes: [],
  }
  const words = [leading?.[2] ?? trailing?.[1] ?? head.trim()]
  for (const raw of segments) {
    const segment = raw.trim()
    const dated = DATED.exec(segment)
    if (segment === 'today') item.isToday = true
    else if (dated?.[1] === 'due') item.due = dated[2] ?? null
    else if (dated?.[1] === 'since') item.since = dated[2] ?? null
    else if (dated?.[1] === 'done') item.doneOn = dated[2] ?? null
    else words.push(segment)
  }
  return { ...item, text: words.join(SEGMENT).trim() }
}

/** The list a file holds; undefined only when it has neither a `# Title` nor an item. */
export function parseList(markdown: string): List | undefined {
  let title: string | null = null
  let deadline: string | null = null
  const headings: Heading[] = []
  let current: Heading | null = null
  let last: Item | null = null
  for (const line of markdown.split('\n')) {
    const heading = HEADING.exec(line)?.[1]
    if (heading !== undefined) {
      current = { name: heading, items: [] }
      headings.push(current)
      last = null
      continue
    }
    title ??= TITLE.exec(line)?.[1] ?? null
    if (headings.length === 0) deadline ??= DEADLINE.exec(line)?.[1] ?? null
    const item = ITEM.exec(line)
    if (item?.[1] !== undefined && item[2] !== undefined) {
      if (current === null) {
        current = { name: '', items: [] }
        headings.push(current)
      }
      last = itemOf(item[1], item[2])
      current.items.push(last)
      continue
    }
    const note = NOTE.exec(line)?.[1]
    if (note !== undefined && last !== null) last.notes.push(note)
    else if (line.trim() !== '') last = null
  }
  const hasItems = headings.some(heading => heading.items.length > 0)
  if (title === null && !hasItems) return undefined
  return { title: title ?? 'Untitled', deadline, headings }
}

export type Pie = '○' | '◔' | '◑' | '◕' | '●'
export type Waiting = { item: Item; ageDays: number | null; isStale: boolean }
export type Summary = {
  done: number
  total: number
  pie: Pie
  daysLeft: number | null
  doing: Item | null
  next: Item | null
  today: Item[]
  waiting: Waiting[]
  overdue: Item[]
}

const STALE_AFTER_DAYS = 3
const DAY_MS = 86_400_000

/** `YYYY-MM-DD` of `ms` in local time. */
export function localDate(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

export function pieOf(done: number, total: number): Pie {
  if (total === 0 || done === 0) return '○'
  if (done >= total) return '●'
  const share = done / total
  if (share <= 1 / 3) return '◔'
  if (share <= 2 / 3) return '◑'
  return '◕'
}

export const isWaiting = (item: Item) => item.owner.kind === 'other' && item.state !== 'done'
const isMine = (item: Item) => item.owner.kind === 'me' || item.owner.kind === 'together'

/** What the pane and band show for a list on `today` (YYYY-MM-DD). */
export function summarize(list: List, today: string): Summary {
  const items = list.headings.flatMap(heading => heading.items)
  const done = items.filter(item => item.state === 'done').length
  const isDueBy = (item: Item, isStrict: boolean) =>
    item.due !== null && (isStrict ? daysBetween(item.due, today) > 0 : daysBetween(item.due, today) >= 0)
  const todays = items.filter(
    item => item.state !== 'done' && item.owner.kind !== 'other' && (item.isToday || item.state === 'doing' || isDueBy(item, false)),
  )
  return {
    done,
    total: items.length,
    pie: pieOf(done, items.length),
    daysLeft: list.deadline === null ? null : daysBetween(today, list.deadline),
    doing: items.find(item => item.state === 'doing') ?? null,
    next: todays.find(isMine) ?? items.find(item => item.state === 'open' && isMine(item)) ?? null,
    today: todays,
    waiting: items.filter(isWaiting).map(item => {
      const ageDays = item.since === null ? null : daysBetween(item.since, today)
      return { item, ageDays, isStale: ageDays !== null && ageDays > STALE_AFTER_DAYS }
    }),
    overdue: items.filter(item => item.state !== 'done' && isDueBy(item, true)),
  }
}
