<script setup lang="ts">
import { computed } from 'vue'
import { QUALITIES, type Quality } from '@/lib/qualities'
import { useDownloadsStore } from '@/stores/downloads'
import { useParseStore, type QualityState } from '@/stores/parse'

const props = defineProps<{
  states: Record<string, QualityState>
  /** 当前主按钮档位，不在折叠列表里重复展示 */
  excludeCode?: string
  activeCode?: string
  playing?: boolean
}>()

const emit = defineEmits<{
  play: [quality: Quality]
  retry: [quality: Quality]
  'retry-failed': []
}>()

const parse = useParseStore()
const downloads = useDownloadsStore()

const rows = computed(() => QUALITIES.filter((q) => q.code !== props.excludeCode))
const resolved = computed(() => rows.value.filter((q) => props.states[q.code]?.status === 'ok').length)
const total = computed(() => rows.value.length)

const failedCount = computed(
  () => rows.value.filter((q) => props.states[q.code]?.status === 'err').length,
)

/** 浏览器解得动的容器：hires 整组（含 TL01 的 .nac）探测 OK 但放不了，只留下载 */
const PLAYABLE_EXTS: ReadonlySet<string> = new Set(['flac', 'ogg', 'mp3', 'm4a'])

/**
 * 直链可播放判定：探测 OK 还不够，容器得是浏览器能解码的。
 * `.nac` 是腾讯自研 AICodec，Chromium 直接报 MEDIA_ERR_SRC_NOT_SUPPORTED。
 */
function isPlayableUrl(quality: Quality, state: QualityState | undefined): boolean {
  if (state?.status !== 'ok' || !state.url) return false
  if (quality.group === 'hires') return false
  if (!PLAYABLE_EXTS.has(quality.ext)) return false
  return !/\.nac(?:[?#]|$)/i.test(state.url)
}

function downloading(code: string): boolean {
  if (!parse.mid) return false
  return downloads.active.some((t) => t.mid === parse.mid && t.code === code)
}

function download(quality: Quality): void {
  if (!parse.mid) return
  downloads.start({
    mid: parse.mid,
    code: quality.code,
    label: parse.track?.name || parse.mid,
  })
}

function statusText(state: QualityState | undefined): string {
  switch (state?.status) {
    case 'ok':
      return 'OK'
    case 'err':
      return 'FAIL'
    case 'loading':
      return '…'
    default:
      return '—'
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <span class="label">音质直链</span>
      <span class="spacer" />
      <button v-if="failedCount > 0" class="qgrid__retry" @click="emit('retry-failed')">
        重试失败 ({{ failedCount }})
      </button>
      <span class="micro mono-num text-dim">{{ resolved }} / {{ total }}</span>
    </div>

    <div class="panel-body panel-body--flush">
      <div class="qgrid">
        <div
          v-for="q in rows"
          :key="q.code"
          class="qrow"
          :class="[
            `qrow--${states[q.code]?.status ?? 'idle'}`,
            `qrow--g-${q.group}`,
            { 'qrow--active': activeCode === q.code },
          ]"
        >
          <span class="qrow__code mono-num">{{ q.code }}</span>
          <span class="qrow__label">{{ q.label }}</span>
          <span class="qrow__status label">{{ statusText(states[q.code]) }}</span>
          <span class="qrow__err micro" :title="states[q.code]?.error ?? ''">{{ states[q.code]?.error ?? '' }}</span>
          <span class="qrow__actions">
            <button
              v-if="states[q.code]?.status === 'err'"
              class="qrow__btn"
              @click="emit('retry', q)"
            >
              重试
            </button>
            <button
              v-if="isPlayableUrl(q, states[q.code])"
              class="qrow__btn"
              :disabled="activeCode === q.code"
              @click="emit('play', q)"
            >
              {{
                activeCode === q.code
                  ? playing
                    ? '正在播放'
                    : '已暂停'
                  : '播放'
              }}
            </button>
            <span
              v-else-if="states[q.code]?.status === 'ok'"
              class="qrow__note"
              title="该容器浏览器无法解码，请下载后用本地播放器"
            >
              仅下载
            </span>
            <button
              class="qrow__btn"
              :disabled="states[q.code]?.status !== 'ok' || downloading(q.code)"
              @click="download(q)"
            >
              {{ downloading(q.code) ? '下载中…' : '下载' }}
            </button>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.qgrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.qgrid__retry {
  height: 18px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--warn);
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  cursor: pointer;
}

.qgrid__retry:hover {
  border-color: var(--warn);
}

.qrow {
  display: grid;
  grid-template-columns: 40px minmax(56px, 1fr) 30px minmax(0, 1.5fr) auto;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 0 var(--sp-3);
  border-bottom: 1px dashed rgb(42 47 54 / 55%);
  font-size: var(--fs-micro);
}

.qrow:last-child {
  border-bottom: none;
}

.qrow__code {
  color: var(--text-faint);
  font-size: var(--fs-label);
  letter-spacing: 0.04em;
}

.qrow__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
}

.qrow__status {
  color: var(--text-faint);
}

.qrow__err {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--err);
  font-size: var(--fs-label);
}

.qrow__actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.qrow__btn {
  height: 17px;
  padding: 0 3px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: var(--fs-label);
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.qrow__btn:hover:not(:disabled) {
  border-color: var(--blue);
  color: var(--blue);
}

.qrow__btn:disabled {
  color: var(--text-faint);
  border-color: var(--line);
  cursor: not-allowed;
}

.qrow__note {
  padding: 0 3px;
  color: var(--text-faint);
  font-size: var(--fs-label);
  line-height: 1;
  white-space: nowrap;
}

.qrow--ok .qrow__label {
  color: var(--text);
}

.qrow--active {
  background: rgb(91 157 255 / 8%);
}

.qrow--active .qrow__label,
.qrow--active .qrow__code {
  color: var(--blue);
}

.qrow--ok .qrow__status {
  color: var(--ok);
}

.qrow--err .qrow__status {
  color: var(--err);
}

.qrow--loading .qrow__status {
  color: var(--warn);
}

.qrow--g-hires .qrow__code {
  color: var(--purple);
}

.qrow--g-lossless .qrow__code {
  color: var(--blue);
}

</style>
