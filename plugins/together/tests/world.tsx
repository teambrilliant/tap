import type { On } from 'claude-code'

export type World = { placed: Set<string>; hidden: Set<string>; files: Map<string, string>; paneCalls: string[] }

export const ROOT = '/work'
export const listPath = (slug: string) => `${ROOT}/tap/lists/${slug}.md`

/** The world beneath the mod in a test: a session at /work, panes that place (each pane call logged), files (absolute paths) from a map. */
export function world(on: On, files: Map<string, string> = new Map()): World {
  const placed = new Set<string>()
  const hidden = new Set<string>()
  const paneCalls: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.root', () => ({ value: ROOT }))
  // as the engine: a fresh open is the shown tab; re-opening an open id leaves it where it is
  on('ui.open', ($, e) => {
    paneCalls.push('open')
    if (!placed.has(e.id)) hidden.delete(e.id)
    placed.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    paneCalls.push('close')
    placed.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => {
    paneCalls.push('panes')
    return { value: [...placed].map(id => ({ id, title: id, isShown: !hidden.has(id), isFocused: false, isPlaced: true })) }
  })
  on('fs.read', ($, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error(`missing ${e.path}`)
    return { value: text }
  })
  on('fs.list', ($, e) => {
    const dir = `${e.path ?? ROOT}/`
    const names = [...files.keys()].filter(path => path.startsWith(dir) && !path.slice(dir.length).includes('/'))
    if (names.length === 0) throw new Error(`ENOENT ${dir}`)
    // a file's position in the map is its age: later entries are newer
    return { value: names.map(path => ({ name: path.slice(dir.length), kind: 'file' as const, size: 1, mtimeMs: [...files.keys()].indexOf(path), isLink: false })) }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: null }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.component === 'AbovePrompt' ? 'BELOW' : ''}</Text>
  })
  return { placed, hidden, files, paneCalls }
}
