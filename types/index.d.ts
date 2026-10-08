export type ListFile = { path: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    together: {
      activeList: string | null
      lists: ListFile[]
      isWorking: boolean
      frame: number
      hasOpened: boolean
    }
  }
}
