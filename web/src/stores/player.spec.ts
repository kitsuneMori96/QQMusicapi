import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore, type PlayerTrack } from './player'

const base: PlayerTrack = {
  mid: '002kR3lm1nTxkV',
  name: '晴天',
  artist: '周杰伦',
  url: 'https://cdn.example/a.mp3',
  cover: '',
  qualityLabel: 'MP3 320',
  qualityCode: 'M800',
}

describe('player store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('同曲切换音质保留进度', () => {
    const store = usePlayerStore()
    store.play(base)
    store.setProgress(42, 200)

    store.play({ ...base, url: 'https://cdn.example/a.flac', qualityLabel: 'SQ 无损', qualityCode: 'F000' })

    expect(store.currentTime).toBe(42)
    expect(store.activeCode).toBe('F000')
    expect(store.nowLabel).toContain('SQ 无损')
  })

  it('换曲重置进度，clear 清空播放状态', () => {
    const store = usePlayerStore()
    store.play(base)
    store.setProgress(42, 200)
    store.play({ ...base, mid: 'anotherMid001', name: '另一首' })
    expect(store.currentTime).toBe(0)

    store.clear()
    expect(store.current).toBeNull()
    expect(store.playing).toBe(false)
    expect(store.nowLabel).toBe('未播放')
  })

  it('seek 每次生成新的请求 id，便于重复跳转', () => {
    const store = usePlayerStore()
    store.seek(10)
    const first = store.seekRequest
    store.seek(10)
    expect(first).not.toBeNull()
    expect(store.seekRequest?.id).toBe((first?.id ?? 0) + 1)
  })
})
