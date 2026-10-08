// bun scripts/check-list.ts <file> [--today YYYY-MM-DD]
// Parses a list with the pane's own parser and prints its summary as JSON; exits 1 when the file is not a list.
import { readFileSync } from 'node:fs'

import { localDate, parseList, summarize } from '../hooks/list'

const [file, flag, date] = process.argv.slice(2)
if (file === undefined) {
  console.error('usage: bun check-list.ts <file> [--today YYYY-MM-DD]')
  process.exit(2)
}
const today = flag === '--today' && date !== undefined ? date : localDate(Date.now())
const list = parseList(readFileSync(file, 'utf8'))
if (list === undefined) {
  console.error(`${file}: not a list (no # title and no - [ ] items)`)
  process.exit(1)
}
console.log(JSON.stringify({ file, title: list.title, deadline: list.deadline, ...summarize(list, today) }, null, 2))
