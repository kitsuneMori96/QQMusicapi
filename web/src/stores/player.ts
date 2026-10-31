import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PlayerTrack {
  name: string
  artist: string
  url: string
  cover: string
  qualityLabel: string
  qualityCode: string
}

/**
 * 播放器状态。APlayer 实例由 PlayerBar 持有（非响应式），
 * 这里只存「当前该播什么」，避免把第三方实例塞进 Pinia。
 */
export const usePlayerStore = defineStore('player', () => {
  const current = ref<PlayerTrack | null>(null)
  const playing = ref(false)
  const nowLabel = ref('未播放')

  function play(track: PlayerTrack): void {
    current.value = track
    nowLabel.value = `▶ ${track.qualityLabel}`
    playing.value = true
  }

  function clear(): void {
    current.value = null
    nowLabel.value = '未播放'
    playing.value = false
  }

  return { current, playing, nowLabel, play, clear }
})
