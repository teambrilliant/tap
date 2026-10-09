import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { ListFile } from '../types'
import { localDate, parseList, summarize } from './list'
import { ListPane, Overview, bandText } from './ui'
import type { OverviewEntry } from './ui'

const PANE = 'together'
const LISTS_DIR = 'thoughts/lists'
const LIST_PATH = /(^|\/)thoughts\/lists\/[^/]+\.md$/u
const SPIN_MS = 120

const activeList = atom({ plugin: 'together', key: 'activeList' }, null)
const lists = atom({ plugin: 'together', key: 'lists' }, [])
const isWorking = atom({ plugin: 'together', key: 'isWorking' }, false)
const frame = atom({ plugin: 'together', key: 'frame' }, 0)
const hasOpened = atom({ plugin: 'together', key: 'hasOpened' }, false)

async function absolute($: EngineInterface, path: string): Promise<string> {
  return path.startsWith('/') ? path : `${await $.session.root()}/${path}`
}

/** Every `.md` in the repo's `thoughts/lists/`; a missing folder is no lists. */
async function loadLists($: EngineInterface) {
  const dir = await absolute($, LISTS_DIR)
  const entries = await $.fs.list(dir).catch(() => [])
  const files: ListFile[] = []
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
    const path = `${dir}/${entry.name}`
    const text = await $.fs.read(path).catch(() => null)
    if (typeof text === 'string') files.push({ path, text, mtimeMs: entry.mtimeMs })
  }
  await update($, lists, () => files)
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
    await $.command.register({ name: 'together', description: 'Open the together pane · /together <slug> picks a list' })
    await loadLists($)
    return next(e)
  })

  on('command.run', { command: 'together' }, async ($, e) => {
    const slug = e.args.trim().replace(/\.md$/u, '')
    await loadLists($)
    if (slug !== '') {
      const path = await absolute($, `${LISTS_DIR}/${slug}.md`)
      if (!(await read($, lists)).some(file => file.path === path)) {
        await $.ui.open({ id: PANE, title: PANE })
        return { text: `together: no ${LISTS_DIR}/${slug}.md` }
      }
      await update($, activeList, () => path)
      await update($, hasOpened, () => true)
      await $.ui.open({ id: PANE, title: PANE })
      return { text: `together: ${slug}` }
    }
    await update($, hasOpened, () => true)
    await $.ui.open({ id: PANE, title: PANE })
    return { text: 'together: pane open.' }
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
          })}
        {Overview({ kit, entries, activePath: active?.file.path ?? null, columns })}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const active = await activeOf($, await entriesOf($))
    if (active === undefined) return below
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Text dimColor wrap="truncate-end">
          {bandText(active.list, active.summary)}
        </Text>
      </Box>
    )
  })
}
