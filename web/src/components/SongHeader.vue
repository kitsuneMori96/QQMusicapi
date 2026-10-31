<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Track } from '@/api/contracts'
import { coverUrl, formatDuration } from '@/lib/mid'

const props = defineProps<{
  track: Track | null
  mid: string
  detailError?: string
}>()

const cover = computed(() => coverUrl(props.track?.album?.mid))
const coverBroken = ref(false)
watch(
  () => props.track?.album?.mid,
  () => {
    coverBroken.value = false
  },
)
const singers = computed(() => {
  const s = props.track?.singer
  if (!Array.isArray(s) || s.length === 0) return '—'
  return s.map((x) => x.name).filter(Boolean).join(' / ')
})
const failed = computed(() => !props.track)
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <span class="label">曲目</span>
      <span class="spacer" />
      <span v-if="failed" class="tag tag--err">DETAIL FAILED</span>
      <span v-else class="tag tag--ok">RESOLVED</span>
    </div>

    <div class="panel-body song">
      <div class="song__cover">
        <img
          v-if="cover && !coverBroken"
          :src="cover"
          :alt="track?.name ?? 'cover'"
          loading="lazy"
          @error="coverBroken = true"
        />
        <span v-else class="label text-faint">NO ART</span>
      </div>

      <div class="song__meta">
        <h2 class="song__title">{{ track?.name || (failed ? '详情获取失败' : '—') }}</h2>
        <dl class="song__kv">
          <div class="kv">
            <dt>歌手</dt>
            <dd>{{ singers }}</dd>
          </div>
          <div class="kv">
            <dt>专辑</dt>
            <dd>{{ track?.album?.name || '—' }}</dd>
          </div>
          <div class="kv">
            <dt>时长</dt>
            <dd class="mono-num">{{ formatDuration(track?.interval) }}</dd>
          </div>
          <div class="kv">
            <dt>标识</dt>
            <dd class="song__ids">mid {{ mid || '—' }} <span class="text-faint">/</span> id {{ track?.id ?? '—' }}</dd>
          </div>
        </dl>
        <p v-if="detailError" class="song__err">详情: {{ detailError }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.song {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--sp-4);
}

.song__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  background: var(--panel-sunken);
  border: var(--hairline);
  border-radius: var(--radius);
  overflow: hidden;
}

.song__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.song__meta {
  min-width: 0;
}

.song__title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-heading);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.song__kv {
  margin: 0;
}

.song__ids {
  font-size: var(--fs-micro);
  color: var(--text-dim);
}

.song__err {
  margin: var(--sp-2) 0 0;
  font-size: var(--fs-label);
  color: var(--err);
  overflow-wrap: anywhere;
}
</style>
