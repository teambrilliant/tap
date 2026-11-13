export type ListFile = { path: string; text: string; mtimeMs: number }

declare module 'claude-code' {
  interface PluginState {
    together: {
      activeList: string | null
      lists: ListFile[]
      isWorking: boolean
      frame: number
      folded: { path: string; heading: string }[]
      hasOpened: boolean
    }
  }
}
