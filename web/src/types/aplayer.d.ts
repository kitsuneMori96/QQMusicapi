export interface APlayerAudio {
  name: string
  artist: string
  url: string
  cover?: string
}

export interface APlayerList {
  audios: APlayerAudio[]
  clear(): void
  add(audios: APlayerAudio[], play?: boolean): void
  switch(index: number): void
}

export interface APlayerInstance {
  list: APlayerList
  audio: HTMLAudioElement
  play(): void
  pause(): void
  seek(time: number): void
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
