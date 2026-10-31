<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LyricData } from '@/api/types'

const props = defineProps<{
  lyric: LyricData | null
  loading?: boolean
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

const text = computed(() => props.lyric?.[active.value] ?? '')
</script>

<template>
  <section class="panel lyric">
    <div class="panel-head">
      <span class="label">歌词</span>
      <span class="spacer" />
      <span v-if="loading" class="spinner" />
      <span v-else-if="lyric" class="tag">{{ available.length }} 轨</span>
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

    <div class="lyric__box scroll-y">
      <pre v-if="text" class="lyric__text">{{ text }}</pre>
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

.lyric__box {
  flex: 1;
  min-height: 140px;
  max-height: 340px;
  margin: var(--sp-2) var(--sp-3) var(--sp-3);
  padding: var(--sp-3);
  background: var(--panel-sunken);
  border: var(--hairline);
  border-radius: var(--radius);
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
