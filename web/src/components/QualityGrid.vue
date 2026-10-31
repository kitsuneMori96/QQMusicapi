<script setup lang="ts">
import { computed } from 'vue'
import { QUALITIES, type Quality } from '@/lib/qualities'
import type { QualityState } from '@/stores/parse'

const props = defineProps<{
  states: Record<string, QualityState>
  resolved: number
  total?: number
  downloading?: Record<string, boolean>
  activeCode?: string
  playing?: boolean
}>()

const emit = defineEmits<{
  play: [quality: Quality]
  download: [quality: Quality]
  retry: [quality: Quality]
  'retry-failed': []
}>()

const total = computed(() => props.total ?? QUALITIES.length)

const failedCount = computed(
  () => QUALITIES.filter((q) => props.states[q.code]?.status === 'err').length,
)

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
          v-for="q in QUALITIES"
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
              class="qrow__btn"
              :disabled="states[q.code]?.status !== 'ok' || activeCode === q.code"
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
            <button
              class="qrow__btn"
              :disabled="states[q.code]?.status !== 'ok' || downloading?.[q.code]"
              @click="emit('download', q)"
            >
              {{ downloading?.[q.code] ? '下载中…' : '下载' }}
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
