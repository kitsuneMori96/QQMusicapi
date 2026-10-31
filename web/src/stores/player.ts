import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface PlayerTrack {
  mid: string
  name: string
  artist: string
  url: string
  cover: string
  qualityLabel: string
  qualityCode: string
}

export interface SeekRequest {
  seconds: number
  id: number
}

/**
 * 播放器状态。APlayer 实例由 PlayerBar 持有（非响应式），
 * 这里只存「当前该播什么」与进度，避免把第三方实例塞进 Pinia。
 */
export const usePlayerStore = defineStore('player', () => {
  const current = ref<PlayerTrack | null>(null)
  const playing = ref(false)
  const nowLabel = ref('未播放')
  const currentTime = ref(0)
  const duration = ref(0)
  const seekRequest = ref<SeekRequest | null>(null)

  let seekSeq = 0

  const activeCode = computed(() => current.value?.qualityCode ?? '')

  function play(track: PlayerTrack): void {
    const sameSong = current.value?.mid === track.mid
    current.value = track
    nowLabel.value = `▶ ${track.qualityLabel}`
    playing.value = true
    if (!sameSong) {
      currentTime.value = 0
      duration.value = 0
    }
  }

  function clear(): void {
    current.value = null
    nowLabel.value = '未播放'
    playing.value = false
    currentTime.value = 0
    duration.value = 0
    seekRequest.value = null
  }

  function setProgress(time: number, total?: number): void {
    if (Number.isFinite(time)) currentTime.value = Math.max(0, time)
    if (total !== undefined && Number.isFinite(total) && total > 0) duration.value = total
  }

  function setPlaying(value: boolean): void {
    playing.value = value
  }

  /** 歌词点击跳转：用自增 id 保证重复跳到同一秒也会触发 */
  function seek(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return
    seekRequest.value = { seconds, id: ++seekSeq }
  }

  return {
    current,
    playing,
    nowLabel,
    currentTime,
    duration,
    seekRequest,
    activeCode,
    play,
    clear,
    setProgress,
    setPlaying,
    seek,
  }
})
