import type { BoxProps, ButtonProps, ElementConstructor, TextProps } from 'claude-code'

import type { ListFile } from '../types'
import { isWaiting } from './list'
import type { Item, List, Owner, Summary } from './list'

export type Kit = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

type Color = 'cyan' | 'red' | 'yellow'

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** Border and padding of the card: what `columns` loses to the frame. */
const FRAME = 4

const clip = (text: string, width: number) => (text.length <= width ? text : `${text.slice(0, Math.max(1, width - 1))}…`)

export const ownerLabel = (owner: Owner) =>
  owner.kind === 'me' ? 'you' : owner.kind === 'together' ? 'you+claude' : owner.name

/** `oct 31` for 2026-10-31. */
const shortDate = (date: string) => {
  const [, month, day] = date.split('-')
  return `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}`
}

/** `╶─ name ─────── 2/4 ╴`, filled to `width`. */
export function divider(name: string, count: string, width: number): string {
  const head = `╶─ ${name} `
  const tail = ` ${count} ╴`
  return `${head}${'─'.repeat(Math.max(1, width - head.length - tail.length))}${tail}`
}

/** `▕████░░░░▏` of `width` cells inside the ends. */
export function progressBar(done: number, total: number, width: number): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return `▕${'█'.repeat(filled)}${'░'.repeat(width - filled)}▏`
}

function Row({ kit, glyph, text, right, width, color, isDim }: { kit: Kit; glyph: string; text: string; right: string; width: number; color?: Color; isDim: boolean }) {
  const { Box, Text } = kit
  return (
    <Box justifyContent="space-between">
      <Text color={color} dimColor={isDim && color === undefined} wrap="truncate-end">
        {` ${glyph} ${clip(text, Math.max(4, width - right.length - 5))}`}
      </Text>
      <Text color={color} dimColor={color === undefined}>
        {right}
      </Text>
    </Box>
  )
}

export type ListPaneProps = {
  kit: Kit
  list: List
  summary: Summary
  path: string
  columns: number
  frame: number
  isWorking: boolean
  folded: readonly string[]
  onToggle: (heading: string) => void
}

/** The active list as a card: header, progress, today, every heading with what's left (foldable), waiting, done count. */
export function ListPane({ kit, list, summary, path, columns, frame, isWorking, folded, onToggle }: ListPaneProps) {
  const { Box, Text, Button } = kit
  const width = Math.max(16, columns - FRAME)
  const isOverdue = (item: Item) => summary.overdue.includes(item)
  const itemRow = (item: Item) => {
    const glyph = item.state === 'doing' ? (isWorking ? (SPINNER[frame % SPINNER.length] ?? '◐') : '◐') : '○'
    const color: Color | undefined = item.state === 'doing' ? 'cyan' : isOverdue(item) ? 'red' : undefined
    return Row({ kit, glyph, text: item.text, right: ownerLabel(item.owner), width, color, isDim: item !== summary.next })
  }
  const deadline =
    summary.daysLeft === null ? null : summary.daysLeft < 0 ? `⚑ ${-summary.daysLeft}d over` : `⚑ ${summary.daysLeft}d`
  const deadlineColor: Color | undefined = summary.daysLeft !== null && summary.daysLeft < 0 ? 'red' : summary.daysLeft !== null && summary.daysLeft <= 3 ? 'yellow' : undefined
  const count = `${summary.done}/${summary.total}`
  const shown = new Set<Item>(summary.today)
  const remaining = list.headings.map(heading => ({
    heading,
    items: heading.items.filter(item => item.state !== 'done' && !isWaiting(item) && !shown.has(item)),
  }))
  return (
    <Box key="card" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold wrap="truncate-end">{`${summary.pie} ${clip(list.title.toLowerCase(), width - (deadline?.length ?? 0) - 3)}`}</Text>
        {deadline !== null && (
          <Text color={deadlineColor} dimColor={deadlineColor === undefined}>
            {deadline}
          </Text>
        )}
      </Box>
      <Box justifyContent="space-between">
        <Text dimColor wrap="truncate-end">
          {progressBar(summary.done, summary.total, Math.max(4, width - count.length - 3))}
        </Text>
        <Text dimColor>{count}</Text>
      </Box>
      {summary.today.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text>✦ today</Text>
          {summary.today.map(itemRow)}
        </Box>
      )}
      {remaining.map(({ heading, items }) => {
        const name = heading.name === '' ? 'list' : heading.name.toLowerCase()
        const count = `${heading.items.filter(item => item.state === 'done').length}/${heading.items.length}`
        const isFolded = folded.includes(heading.name)
        return (
          <Box key={`h-${heading.name}`} flexDirection="column" marginTop={1}>
            {items.length === 0 ? (
              <Text dimColor wrap="truncate-end">
                {divider(`  ${name}`, count, width)}
              </Text>
            ) : (
              <Button key={`fold:${heading.name}`} label={divider(`${isFolded ? '▸' : '▾'} ${name}`, count, width)} plain dimColor onPress={() => onToggle(heading.name)} />
            )}
            {!isFolded && items.map(itemRow)}
          </Box>
        )
      })}
      {summary.waiting.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text>◷ waiting</Text>
          {summary.waiting.map(({ item, ageDays, isStale }) =>
            Row({ kit, glyph: '◷', text: `${item.owner.name} · ${item.text}`, right: ageDays === null ? '' : `${ageDays}d`, width, color: isStale ? 'yellow' : undefined, isDim: true }),
          )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor wrap="truncate-end">{clip(`· · ─ ─ ──── ${summary.done} done ──── ─ ─ · ·`, width)}</Text>
      </Box>
      <Text dimColor wrap="truncate-start">
        {path}
      </Text>
    </Box>
  )
}

export type OverviewEntry = { file: ListFile; list: List; summary: Summary }

export type OverviewProps = { kit: Kit; entries: readonly OverviewEntry[]; activePath: string | null; columns: number; onOpen: (path: string) => void }

/** Totals across the repo's lists, then every list but the active one on a line; pressing one makes it active. */
export function Overview({ kit, entries, activePath, columns, onOpen }: OverviewProps) {
  const { Box, Text, Button } = kit
  if (entries.length === 0) return <Text dimColor>  no lists yet · /together:list to start</Text>
  const today = entries.reduce((sum, entry) => sum + entry.summary.today.length, 0)
  const waiting = entries.reduce((sum, entry) => sum + entry.summary.waiting.length, 0)
  const width = Math.max(16, columns - 2)
  return (
    <Box key="overview" flexDirection="column" paddingX={1}>
      <Text dimColor>{`✦ ${today} today · ◷ ${waiting} waiting`}</Text>
      {entries
        .filter(entry => entry.file.path !== activePath)
        .map(({ file, list, summary }) => {
          const right = `${summary.done}/${summary.total}${list.deadline === null ? '' : ` ⚑ ${shortDate(list.deadline)}`}`
          return (
            <Box key={file.path} justifyContent="space-between">
              <Button key={`list:${file.path}`} label={`${summary.pie} ${clip(list.title.toLowerCase(), width - right.length - 4)}`} plain dimColor onPress={() => onOpen(file.path)} />
              <Text dimColor color={summary.overdue.length > 0 ? 'red' : undefined}>
                {right}
              </Text>
            </Box>
          )
        })}
    </Box>
  )
}

/** `◑ emma launch 7/14 · next: Buy domain (you) · ◷ neil 4d` */
export function bandText(list: List, summary: Summary): string {
  const parts = [`${summary.pie} ${list.title.toLowerCase()} ${summary.done}/${summary.total}`]
  if (summary.next !== null) parts.push(`next: ${summary.next.text} (${ownerLabel(summary.next.owner)})`)
  const longest = [...summary.waiting].sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))[0]
  if (longest !== undefined) parts.push(`◷ ${longest.item.owner.name}${longest.ageDays === null ? '' : ` ${longest.ageDays}d`}`)
  return parts.join(' · ')
}
