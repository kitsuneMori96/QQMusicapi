export interface APlayerAudio {
  name: string
  artist: string
  url: string
  cover?: string
}

export interface APlayerInstance {
  list: {
    clear(): void
    add(audios: APlayerAudio[], play?: boolean): void
  }
  play(): void
  destroy(): void
}

export interface APlayerConstructor {
  new (options: {
    container: HTMLElement
    fixed?: boolean
    autoplay?: boolean
    theme?: string
    loop?: 'all' | 'one' | 'none'
    order?: 'list' | 'random'
    volume?: number
    listMaxHeight?: string | number
    audio?: APlayerAudio[]
  }): APlayerInstance
}

declare global {
  interface Window {
    APlayer?: APlayerConstructor
  }
}

export {}
