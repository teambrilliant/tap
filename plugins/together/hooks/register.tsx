import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { ListFile } from '../types'
import { localDate, parseList, summarize } from './list'
import { ListPane, Overview, bandText } from './ui'
import type { OverviewEntry } from './ui'

const PANE = 'together'
const LISTS_DIR = 'tap/lists'
const LIST_PATH = /(^|\/)tap\/lists\/[^/]+\.md$/u
const SPIN_MS = 120

const activeList = atom({ plugin: 'together', key: 'activeList' }, null)
const lists = atom({ plugin: 'together', key: 'lists' }, [])
const isWorking = atom({ plugin: 'together', key: 'isWorking' }, false)
const frame = atom({ plugin: 'together', key: 'frame' }, 0)
const hasOpened = atom({ plugin: 'together', key: 'hasOpened' }, false)
const folded = atom({ plugin: 'together', key: 'folded' }, [])

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
const slugOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/u, '')

/** `path` from the session's root unless it starts at `/`, with `.` and `..` folded out. */
async function absolute($: EngineInterface, path: string): Promise<string> {
  const parts: string[] = []
  for (const part of (path.startsWith('/') ? path : `${await $.session.root()}/${path}`).split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '' && part !== '.') parts.push(part)
  }
  return `/${parts.join('/')}`
}

/**
 * Every `.md` in the repo's `tap/lists/`, then in the folder of the active list when that is
 * another repo's, then in `alsoDir`; a missing folder is no lists.
 */
async function loadLists($: EngineInterface, alsoDir?: string) {
  const active = await read($, activeList)
  const dirs = new Set([await absolute($, LISTS_DIR), ...(active === null ? [] : [dirOf(active)]), ...(alsoDir === undefined ? [] : [alsoDir])])
  const files: ListFile[] = []
  for (const dir of dirs) {
    const entries = await $.fs.list(dir).catch(() => [])
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
      const path = `${dir}/${entry.name}`
      const text = await $.fs.read(path).catch(() => null)
      if (typeof text === 'string') files.push({ path, text, mtimeMs: entry.mtimeMs })
    }
  }
  await update($, lists, () => files)
}

/** Brings the pane to the front: an open on an id that is behind another tab leaves it there, so that one is closed first. */
async function showPane($: EngineInterface) {
  await update($, hasOpened, () => true)
  const pane = (await $.ui.panes()).find(open => open.id === PANE)
  if (pane !== undefined && !(pane.isPlaced && pane.isShown)) await $.ui.close({ id: PANE })
  await $.ui.open({ id: PANE, title: PANE, focus: true })
}

type Named = { path: string } | { reason: string }

/**
 * The list `/together <typed>` names. `typed` is an `@` mention, a path into any `tap/lists/`,
 * a file name or a slug; a slug that is no file may be part of one list's slug or title.
 */
async function listNamed($: EngineInterface, typed: string): Promise<Named> {
  const isPath = typed.includes('/')
  const named = await absolute($, `${isPath ? typed : `${LISTS_DIR}/${typed}`}${typed.endsWith('.md') ? '' : '.md'}`)
  await loadLists($, LIST_PATH.test(named) ? dirOf(named) : undefined)
  const files = await read($, lists)
  const exact = files.find(file => file.path === named)
  if (exact !== undefined) {
    return parseList(exact.text) === undefined ? { reason: `${slugOf(named)}.md has no # title and no - [ ] items` } : { path: named }
  }
  await loadLists($)
  const wanted = typed.toLowerCase()
  const matches = (await entriesOf($)).filter(
    entry => !isPath && (slugOf(entry.file.path).toLowerCase().includes(wanted) || entry.list.title.toLowerCase().includes(wanted)),
  )
  const [match, ...others] = matches
  if (match !== undefined && others.length === 0) return { path: match.file.path }
  if (match !== undefined) return { reason: `"${typed}" matches ${matches.map(entry => slugOf(entry.file.path)).join(', ')}` }
  const slugs = (await entriesOf($)).map(entry => slugOf(entry.file.path))
  return { reason: `no list "${typed}" · ${slugs.length === 0 ? `${LISTS_DIR} has none` : `lists: ${slugs.join(', ')}`}` }
}

/** The session touched a list: it becomes the active one; the first time, the pane opens. */
async function activate($: EngineInterface, filePath: string) {
  await update($, activeList, () => filePath)
  await loadLists($)
  if (!(await read($, hasOpened))) {
    await update($, hasOpened, () => true)
    await $.ui.open({ id: PANE, title: PANE })
  }
}

/**
 * Shown → close; otherwise close and open fresh: re-opening an open id leaves it behind
 * another tab, or unplaced. No await before the pane calls: an open after one no longer
 * counts as the person's press, and an unasked pane waits unplaced below 144 columns.
 */
function togglePane($: EngineInterface, isShown: boolean) {
  void $.ui.close({ id: PANE })
  if (isShown) return
  void $.ui.open({ id: PANE, title: PANE })
  void update($, hasOpened, () => true)
}

/** Every list that parses, summarized for today. */
async function entriesOf($: EngineInterface): Promise<OverviewEntry[]> {
  const today = localDate(await $.clock.now())
  return (await read($, lists)).flatMap(file => {
    const list = parseList(file.text)
    return list === undefined ? [] : [{ file, list, summary: summarize(list, today) }]
  })
}

/** The list the session last touched; until it touches one, the most recently modified. */
async function activeOf($: EngineInterface, entries: readonly OverviewEntry[]): Promise<OverviewEntry | undefined> {
  const activePath = await read($, activeList)
  const newest = [...entries].sort((a, b) => b.file.mtimeMs - a.file.mtimeMs)[0]
  return entries.find(entry => entry.file.path === activePath) ?? newest
}

const isTouched = (ran: { deny?: unknown; isError?: boolean }, filePath: string) =>
  ran.deny === undefined && ran.isError !== true && LIST_PATH.test(filePath)

const hasDoing = (text: string | undefined) =>
  text !== undefined && (parseList(text)?.headings.some(heading => heading.items.some(item => item.state === 'doing')) ?? false)

export const register: Register = on => {
  let spinner: Timer | null = null
  const stopSpinner = () => {
    spinner?.cancel()
    spinner = null
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'together', description: 'Open the together pane · /together <list> picks one by name or path', argumentHint: '[list]' })
    await loadLists($)
    return next(e)
  })

  on('command.run', { command: 'together' }, async ($, e) => {
    const typed = e.args.trim().replace(/^@/u, '').replace(/^(["'])(.*)\1$/u, '$2')
    if (typed === '') {
      await loadLists($)
      await showPane($)
      return { text: 'pane open' }
    }
    const named = await listNamed($, typed)
    if ('reason' in named) {
      await $.ui.open({ id: PANE, title: PANE })
      return { text: named.reason }
    }
    await update($, activeList, () => named.path)
    await loadLists($)
    await showPane($)
    return { text: slugOf(named.path) }
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    if (isTouched(ran, e.file_path)) await activate($, await absolute($, e.file_path))
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (isTouched(ran, e.file_path)) await activate($, await absolute($, e.file_path))
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (isTouched(ran, e.file_path)) await activate($, await absolute($, e.file_path))
    return ran
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    const submitted = await next(e)
    await update($, isWorking, () => true)
    const path = await read($, activeList)
    const active = (await read($, lists)).find(file => file.path === path)
    if (spinner === null && hasDoing(active?.text)) spinner = $.clock.every(SPIN_MS, () => void update($, frame, n => n + 1))
    return submitted
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const answer = await next(e)
    stopSpinner()
    await update($, isWorking, () => false)
    await loadLists($)
    return answer
  })


  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const kit = $.ui.resolve(e)
    const { Box } = kit
    const entries = await entriesOf($)
    const active = await activeOf($, entries)
    const root = `${await $.session.root()}/`
    const columns = e.props.bodyColumns
    return (
      <Box flexDirection="column" gap={1}>
        {active !== undefined &&
          ListPane({
            kit,
            list: active.list,
            summary: active.summary,
            path: active.file.path.startsWith(root) ? active.file.path.slice(root.length) : active.file.path,
            columns,
            frame: active.summary.doing === null ? 0 : await read($, frame),
            isWorking: await read($, isWorking),
            folded: (await read($, folded)).filter(fold => fold.path === active.file.path).map(fold => fold.heading),
            onToggle: heading =>
              void update($, folded, current =>
                current.some(fold => fold.path === active.file.path && fold.heading === heading)
                  ? current.filter(fold => !(fold.path === active.file.path && fold.heading === heading))
                  : [...current, { path: active.file.path, heading }],
              ),
          })}
        {Overview({ kit, entries, activePath: active?.file.path ?? null, columns, onOpen: path => void update($, activeList, () => path) })}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const active = await activeOf($, await entriesOf($))
    if (active === undefined) return below
    const pane = (await $.ui.panes()).find(open => open.id === PANE)
    const isShown = pane?.isPlaced === true && pane.isShown
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Button key="toggle-pane" hotkey="r" plain onPress={() => togglePane($, isShown)}>
          <Text dimColor wrap="truncate-end">
            {bandText(active.list, active.summary)}
          </Text>
        </Button>
      </Box>
    )
  })
}
