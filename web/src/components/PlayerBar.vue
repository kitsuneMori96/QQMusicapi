<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayerStore, type PlayerTrack } from '@/stores/player'
import type { APlayerInstance } from '@/types/aplayer'

const player = usePlayerStore()
const container = ref<HTMLElement | null>(null)
const instance = ref<APlayerInstance | null>(null)
const unavailable = ref('')
const mediaError = ref('')
/** 当前曲目是否真的出过声：用来区分「待播」与「已暂停」 */
const sounded = ref(false)

/**
 * 状态栏文案。`▶` 只留给用户显式点行内播放那一刻（store.play 写入）；
 * 按 APlayer 自带按钮起播沿用装载时的档位文案，暂停后显示「已暂停」。
 */
const displayLabel = computed(() => {
  const track = player.current
  const raw = player.nowLabel
  if (!track) return raw
  if (player.playing) {
    return raw.startsWith('待播 ') ? track.qualityLabel : raw
  }
  if (raw.startsWith('▶ ')) return '已暂停'
  if (raw.startsWith('待播 ') && sounded.value) return '已暂停'
  return raw
})

const BASE_TITLE = '解析 // QQMUSIC'

/** APlayer 本地托管（用户网络无法访问 jsdelivr，禁止改回 CDN） */
function loadVendor(): Promise<void> {
  if (window.APlayer) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-aplayer]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('APlayer 脚本加载失败')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `${import.meta.env.BASE_URL}vendor/APlayer.min.js`
    script.async = true
    script.dataset.aplayer = '1'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error(`无法加载 ${script.src}`)), { once: true })
    document.head.appendChild(script)
  })
}

function onTime(): void {
  const audio = instance.value?.audio
  if (audio) player.setProgress(audio.currentTime)
}

function onDuration(): void {
  const audio = instance.value?.audio
  if (audio) player.setProgress(audio.currentTime, audio.duration)
}

function onPlay(): void {
  sounded.value = true
  player.setPlaying(true)
}

function onPause(): void {
  player.setPlaying(false)
}

function onMediaError(): void {
  if (!player.current) return
  mediaError.value = '音频加载失败，直链可能已过期或该容器浏览器不支持，请换档或重新解析后播放'
  player.setPlaying(false)
}

function bindAudio(): void {
  const audio = instance.value?.audio
  if (!audio) return
  audio.addEventListener('timeupdate', onTime)
  audio.addEventListener('durationchange', onDuration)
  audio.addEventListener('loadedmetadata', onDuration)
  audio.addEventListener('play', onPlay)
  audio.addEventListener('pause', onPause)
  audio.addEventListener('error', onMediaError)
}

function unbindAudio(): void {
  const audio = instance.value?.audio
  if (!audio) return
  audio.removeEventListener('timeupdate', onTime)
  audio.removeEventListener('durationchange', onDuration)
  audio.removeEventListener('loadedmetadata', onDuration)
  audio.removeEventListener('play', onPlay)
  audio.removeEventListener('pause', onPause)
  audio.removeEventListener('error', onMediaError)
}

function updateMediaSession(track: PlayerTrack): void {
  document.title = `${track.name} · ${track.artist} // QQMUSIC`
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name,
    artist: track.artist,
    album: track.qualityLabel,
    artwork: track.cover
      ? [{ src: track.cover, sizes: '300x300', type: 'image/jpeg' }]
      : [],
  })
}

function clearMediaSession(): void {
  document.title = BASE_TITLE
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
}

function toAudio(track: PlayerTrack): {
  name: string
  artist: string
  url: string
  cover: string
} {
  return {
    name: `${track.name} [${track.qualityLabel}]`,
    artist: track.artist,
    url: track.url,
    cover: track.cover,
  }
}

function applyTrack(track: PlayerTrack | null, prev: PlayerTrack | null): void {
  const ap = instance.value
  if (!ap) return
  mediaError.value = ''

  if (!track) {
    ap.pause()
    ap.list.clear()
    clearMediaSession()
    return
  }

  updateMediaSession(track)

  const sameSong = Boolean(prev?.mid && track.mid && prev.mid === track.mid)
  if (sameSong && prev?.qualityCode === track.qualityCode) return

  if (sameSong) {
    // 同曲换音质：原地换源，尽量保留播放进度与暂停状态
    const audio = ap.audio
    const at = audio?.currentTime ?? 0
    const wasPlaying = audio ? !audio.paused : true
    const item = ap.list.audios[0]
    if (item) {
      item.url = track.url
      item.name = `${track.name} [${track.qualityLabel}]`
      item.artist = track.artist
      item.cover = track.cover
    }
    ap.list.switch(0)
    if (audio && at > 0) {
      const restore = (): void => {
        const max = Number.isFinite(audio.duration) ? audio.duration : at
        audio.currentTime = Math.min(at, max)
      }
      if (audio.readyState >= 1) restore()
      else audio.addEventListener('loadedmetadata', restore, { once: true })
    }
    if (!wasPlaying) ap.pause()
    return
  }

  ap.pause()
  ap.list.clear()
  // APlayer.List.add 只收一个参数，第二个 play 标记会被忽略；起播由下面显式决定
  ap.list.add([toAudio(track)])
  if (player.playing) void ap.play()
}

onMounted(async () => {
  if (!container.value) return
  try {
    await loadVendor()
    if (!window.APlayer) throw new Error('APlayer 全局对象缺失')
    instance.value = new window.APlayer({
      container: container.value,
      fixed: false,
      autoplay: false,
      theme: '#5b9dff',
      loop: 'one',
      order: 'list',
      volume: 0.7,
      listMaxHeight: 80,
      audio: [],
    })
    bindAudio()
    if (player.current) applyTrack(player.current, null)
  } catch (e) {
    // 播放器失败不能拖垮解析与下载
    unavailable.value = e instanceof Error ? e.message : String(e)
  }
})

watch(
  () => player.current,
  (track, prev) => {
    // 换曲/换档视为新装载：还没出过声
    if (!prev || !track || prev.mid !== track.mid || prev.qualityCode !== track.qualityCode) {
      sounded.value = false
    }
    applyTrack(track ?? null, prev ?? null)
  },
)

/**
 * 装载（load，playing=false）与起播（play，playing=true）由 store 决定。
 * current 的 watch 在「同曲同档」时会提前返回，所以这里负责把 play() 落到实处。
 */
watch(
  () => player.playing,
  (playing) => {
    const ap = instance.value
    if (!ap) return
    if (playing) {
      if (ap.audio.paused) void ap.play()
    } else if (!ap.audio.paused) {
      ap.pause()
    }
  },
)

watch(
  () => player.seekRequest,
  (req) => {
    const ap = instance.value
    if (!req || !ap || !player.current) return
    ap.seek(req.seconds)
    if (ap.audio.paused) ap.play()
  },
)

onBeforeUnmount(() => {
  unbindAudio()
  instance.value?.destroy()
  instance.value = null
  clearMediaSession()
})
</script>

<template>
  <section class="panel player">
    <div class="panel-head">
      <span class="label">播放器</span>
      <span class="micro text-dim">APLAYER</span>
      <span class="spacer" />
      <span class="micro" :class="player.current ? 'text-blue' : 'text-faint'">{{ displayLabel }}</span>
    </div>

    <div class="player__body">
      <div ref="container" class="player__mount" />
      <p v-if="unavailable" class="player__fallback">
        播放器不可用：{{ unavailable }}（解析与下载不受影响）
      </p>
      <p v-if="mediaError" class="player__fallback">{{ mediaError }}</p>
    </div>
  </section>
</template>

<style scoped>
.player__body {
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  min-width: 0;
}

.player__mount {
  min-width: 0;
}

.player__fallback {
  margin: var(--sp-2) 0 0;
  font-size: var(--fs-label);
  color: var(--warn);
}

/* APlayer 暗色适配：去掉圆角阴影，贴合终端风 */
.player__mount {
  background: var(--panel-sunken);
  color: var(--text);
  border: var(--hairline);
  border-radius: 0;
  box-shadow: none;
  font-family: var(--font-mono);
}

.player__mount :deep(.aplayer-body),
.player__mount :deep(.aplayer-info) {
  background: var(--panel-sunken);
  color: var(--text);
  border-color: var(--line);
  box-shadow: none;
  font-family: var(--font-mono);
}

.player__mount :deep(.aplayer .aplayer-info) {
  border-bottom: var(--hairline);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-music .aplayer-title) {
  color: var(--text);
  font-size: var(--fs-body);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-music .aplayer-author) {
  color: var(--text-dim);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-time) {
  color: var(--text-faint);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-bar-wrap .aplayer-bar) {
  background: var(--line) !important;
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-bar-wrap .aplayer-bar .aplayer-loaded) {
  background: var(--line-strong) !important;
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-bar-wrap .aplayer-bar .aplayer-played) {
  background: var(--blue);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-bar-wrap .aplayer-bar .aplayer-thumb) {
  background: var(--blue);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-icon) {
  fill: var(--text-dim);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-icon:hover) {
  fill: var(--blue);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-volume-wrap .aplayer-volume-bar-wrap .aplayer-volume-bar) {
  background: var(--line);
}

.player__mount :deep(.aplayer .aplayer-info .aplayer-controller .aplayer-volume-wrap .aplayer-volume-bar-wrap .aplayer-volume-bar .aplayer-volume) {
  background: var(--blue);
}

.player__mount :deep(.aplayer .aplayer-list) {
  background: var(--panel);
  border-top: var(--hairline);
}

.player__mount :deep(.aplayer .aplayer-list ol li) {
  color: var(--text-dim);
  border-top: 1px dashed rgb(42 47 54 / 55%);
}

.player__mount :deep(.aplayer .aplayer-list ol li:hover) {
  background: var(--panel-raised);
}

.player__mount :deep(.aplayer .aplayer-list ol li.aplayer-list-light) {
  background: var(--panel-sunken);
  color: var(--blue);
}

.player__mount :deep(.aplayer .aplayer-list ol li .aplayer-list-index),
.player__mount :deep(.aplayer .aplayer-list ol li .aplayer-list-author) {
  color: var(--text-faint);
}
</style>
