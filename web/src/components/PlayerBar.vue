<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import type { APlayerInstance } from '@/types/aplayer'

const player = usePlayerStore()
const container = ref<HTMLElement | null>(null)
const instance = ref<APlayerInstance | null>(null)
const unavailable = ref('')

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
  } catch (e) {
    // 播放器失败不能拖垮解析与下载
    unavailable.value = e instanceof Error ? e.message : String(e)
  }
})

watch(
  () => player.current,
  (track) => {
    const ap = instance.value
    if (!ap || !track) return
    try {
      ap.list.clear()
      ap.list.add(
        [
          {
            name: `${track.name} [${track.qualityLabel}]`,
            artist: track.artist,
            url: track.url,
            cover: track.cover,
          },
        ],
        true,
      )
    } catch (e) {
      unavailable.value = e instanceof Error ? e.message : String(e)
    }
  },
)

onBeforeUnmount(() => {
  instance.value?.destroy()
  instance.value = null
})
</script>

<template>
  <section class="panel player">
    <div class="panel-head">
      <span class="label">播放器</span>
      <span class="micro text-dim">APLAYER</span>
      <span class="spacer" />
      <span class="micro" :class="player.current ? 'text-blue' : 'text-faint'">{{ player.nowLabel }}</span>
    </div>

    <div class="player__body">
      <div ref="container" class="player__mount" />
      <p v-if="unavailable" class="player__fallback">
        播放器不可用：{{ unavailable }}（解析与下载不受影响）
      </p>
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
.player__mount :deep(.aplayer) {
  background: var(--panel-sunken);
  color: var(--text);
  border: var(--hairline);
  border-radius: 0;
  box-shadow: none;
  font-family: var(--font-mono);
}

.player__mount :deep(.aplayer .aplayer-info) {
  border-bottom-color: var(--line);
}

.player__mount :deep(.aplayer .aplayer-list) {
  border-top-color: var(--line);
}

.player__mount :deep(.aplayer .aplayer-list ol li) {
  border-top-color: var(--line);
}
</style>
