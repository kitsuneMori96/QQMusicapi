<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LyricData } from '@/api/contracts'
import { findActiveIndex, parseLrc } from '@/lib/lrc'

const props = defineProps<{
  lyric: LyricData | null
  loading?: boolean
  saving?: boolean
  currentTime?: number
  seekable?: boolean
}>()

const emit = defineEmits<{
  seek: [seconds: number]
  download: [kind: LyricKey]
}>()

type LyricKey = 'lyric' | 'trans' | 'roma'

const TABS: ReadonlyArray<{ key: LyricKey; label: string }> = [
  { key: 'lyric', label: '原文' },
  { key: 'trans', label: '翻译' },
  { key: 'roma', label: '罗马音' },
]

const available = computed(() => TABS.filter((t) => Boolean(props.lyric?.[t.key])))
const active = ref<LyricKey>('lyric')

watch(
  available,
  (list) => {
    if (!list.some((t) => t.key === active.value)) {
      active.value = list[0]?.key ?? 'lyric'
    }
  },
  { immediate: true },
)

const rawText = computed(() => props.lyric?.[active.value] ?? '')
const canSave = computed(() => Boolean(rawText.value) && !props.loading && !props.saving)
const lines = computed(() => parseLrc(props.lyric?.[active.value]))
const hasLines = computed(() => lines.value.length > 0)
const activeIndex = computed(() => findActiveIndex(lines.value, props.currentTime))

const box = ref<HTMLElement | null>(null)
let suppressUntil = 0

/** 用户主动滚动后 3 秒内不抢滚动位置 */
function suppressAutoScroll(): void {
  suppressUntil = Date.now() + 3000
}

function scrollToActive(): void {
  if (Date.now() < suppressUntil) return
  const el = box.value
  if (!el) return
  const line = el.querySelector<HTMLElement>('.lyric__line--active')
  if (!line) return
  el.scrollTop = line.offsetTop - el.clientHeight / 2 + line.clientHeight / 2
}

watch(activeIndex, () => scrollToActive())
watch(active, () => {
  if (box.value) box.value.scrollTop = 0
})

function jump(seconds: number): void {
  if (!props.seekable) return
  emit('seek', seconds)
}
</script>

<template>
  <section class="panel lyric">
    <div class="panel-head">
      <span class="label">歌词</span>
      <span class="spacer" />
      <span v-if="loading" class="spinner" />
      <span v-else-if="lyric" class="tag">{{ available.length }} 轨</span>
      <button
        class="lyric__save"
        :disabled="!canSave"
        :title="saving ? '下载中…' : '下载当前轨的 .lrc'"
        @click="emit('download', active)"
      >
        {{ saving ? '下载中…' : '下载 .lrc' }}
      </button>
    </div>

    <div class="lyric__tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="lyric__tab"
        :class="{ 'lyric__tab--active': active === t.key }"
        :disabled="!lyric?.[t.key]"
        @click="active = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <p v-if="lyric?.decodeError" class="lyric__decode-err">{{ lyric.decodeError }}</p>

    <div
      ref="box"
      class="lyric__box scroll-y"
      @wheel.passive="suppressAutoScroll"
      @pointerdown="suppressAutoScroll"
    >
      <ol v-if="hasLines" class="lyric__lines">
        <li
          v-for="(line, index) in lines"
          :key="`${line.time}-${index}`"
          class="lyric__line"
          :class="{
            'lyric__line--active': index === activeIndex,
            'lyric__line--seekable': seekable,
          }"
          @click="jump(line.time)"
        >
          {{ line.text || '♪' }}
        </li>
      </ol>
      <pre v-else-if="rawText" class="lyric__text">{{ rawText }}</pre>
      <p v-else class="empty">{{ loading ? '加载中…' : '尚无歌词' }}</p>
    </div>
  </section>
</template>

<style scoped>
.lyric {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.lyric__tabs {
  display: flex;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3) 0;
}

.lyric__tab {
  height: 19px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-faint);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.lyric__tab:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-strong);
}

.lyric__tab--active {
  color: var(--blue);
  border-color: rgb(91 157 255 / 45%);
  background: var(--panel-sunken);
}

.lyric__tab:disabled {
  cursor: not-allowed;
  color: var(--line-strong);
}

.lyric__save {
  height: 19px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-faint);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  cursor: pointer;
}

.lyric__save:hover:not(:disabled) {
  color: var(--blue);
  border-color: rgb(91 157 255 / 45%);
}

.lyric__save:disabled {
  cursor: not-allowed;
  color: var(--line-strong);
}

.lyric__decode-err {
  margin: var(--sp-2) var(--sp-3) 0;
  padding: 2px 6px;
  border: 1px solid rgb(242 193 78 / 45%);
  border-radius: var(--radius);
  font-size: var(--fs-label);
  color: var(--warn);
}

.lyric__box {
  position: relative;
  flex: 1;
  min-height: 140px;
  max-height: 340px;
  margin: var(--sp-2) var(--sp-3) var(--sp-3);
  padding: var(--sp-3);
  background: var(--panel-sunken);
  border: var(--hairline);
  border-radius: var(--radius);
}

.lyric__lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lyric__line {
  padding: 1px 4px;
  border-left: 2px solid transparent;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: var(--fs-body);
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  transition:
    color 0.12s linear,
    background 0.12s linear;
}

.lyric__line--seekable {
  cursor: pointer;
}

.lyric__line--seekable:hover {
  color: var(--text);
}

.lyric__line--active {
  color: var(--blue);
  border-left-color: var(--blue);
  background: rgb(91 157 255 / 8%);
}

.lyric__text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-body);
  line-height: 1.75;
  color: var(--text-dim);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
