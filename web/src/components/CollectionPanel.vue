<script setup lang="ts">
import type { CollectionKind } from '@/api/collection'
import type { CollectionTrack } from '@/api/contracts'
import { formatDuration } from '@/lib/mid'

const props = defineProps<{
  kind: CollectionKind
  name: string
  sub: string
  cover: string
  desc: string
  total: number
  items: CollectionTrack[]
  hasMore: boolean
  loading?: boolean
  loadingMore?: boolean
  error?: string
  activeMid?: string
}>()

const emit = defineEmits<{
  select: [mid: string]
  more: []
  close: []
}>()

function isActive(track: CollectionTrack): boolean {
  return Boolean(track.mid && track.mid === props.activeMid)
}

function moveFocus(event: KeyboardEvent, step: number): void {
  const current = event.currentTarget as HTMLElement
  const host = current.parentElement
  if (!host) return
  const buttons = [
    ...host.querySelectorAll<HTMLButtonElement>('button.collection__row:not(:disabled)'),
  ]
  const index = buttons.indexOf(current as HTMLButtonElement)
  if (index < 0 || buttons.length === 0) return
  buttons[(index + step + buttons.length) % buttons.length]?.focus()
}
</script>

<template>
  <section class="panel collection">
    <div class="panel-head">
      <span class="label">{{ kind === 'album' ? '专辑' : '歌单' }}</span>
      <span class="spacer" />
      <span v-if="loading" class="spinner" />
      <span v-else class="micro mono-num text-dim">{{ total }} 首</span>
      <button class="collection__close" aria-label="关闭合集" @click="emit('close')">×</button>
    </div>

    <div class="collection__head">
      <img
        v-if="cover"
        class="collection__cover"
        :src="cover"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
      />
      <div class="collection__meta">
        <p class="collection__name">{{ name || '—' }}</p>
        <p class="micro text-faint">{{ sub }}</p>
        <p v-if="desc && desc !== name" class="collection__desc micro text-dim">{{ desc }}</p>
      </div>
    </div>

    <div class="collection__list scroll-y">
      <template v-if="loading && items.length === 0">
        <div v-for="n in 4" :key="n" class="collection__row collection__row--skeleton">
          <span class="collection__idx mono-num">··</span>
          <span class="skeleton-line" />
          <span class="skeleton-line skeleton-line--short" />
        </div>
      </template>

      <button
        v-for="(track, index) in items"
        :key="track.mid || index"
        class="collection__row"
        :class="{ 'collection__row--active': isActive(track) }"
        :disabled="isActive(track)"
        @click="emit('select', track.mid)"
        @keydown.down.prevent="moveFocus($event, 1)"
        @keydown.up.prevent="moveFocus($event, -1)"
      >
        <span class="collection__idx mono-num">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="collection__title">{{ track.name || '—' }}</span>
        <span class="collection__singer">{{ track.singer || '—' }}</span>
        <span class="collection__album">{{ track.album || '—' }}</span>
        <span class="collection__time mono-num">{{ formatDuration(track.interval) }}</span>
      </button>

      <p v-if="error" class="empty text-err">{{ error }}</p>
      <p v-else-if="items.length === 0 && !loading" class="empty">这里还没有曲目</p>
    </div>

    <div v-if="hasMore" class="collection__more">
      <button class="btn btn--ghost" :disabled="loadingMore" @click="emit('more')">
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.collection {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.collection__head {
  display: flex;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: var(--hairline);
}

.collection__cover {
  width: 72px;
  height: 72px;
  flex: none;
  border: var(--hairline);
  object-fit: cover;
}

.collection__meta {
  min-width: 0;
}

.collection__name {
  font-size: var(--fs-body);
  color: var(--text);
}

.collection__desc {
  margin-top: var(--sp-1);
  max-height: 48px;
  overflow: hidden;
  line-height: 1.5;
}

.collection__list {
  max-height: 300px;
  min-height: 80px;
}

.collection__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 48px;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  min-height: 24px;
  padding: 0 var(--sp-3);
  border-bottom: 1px dashed rgb(42 47 54 / 55%);
  text-align: left;
  font-size: var(--fs-micro);
  cursor: pointer;
}

.collection__row:last-child {
  border-bottom: none;
}

.collection__row:hover:not(:disabled) .collection__title {
  color: var(--blue);
}

.collection__row:disabled {
  cursor: default;
}

.collection__row--active {
  background: rgb(91 157 255 / 8%);
}

.collection__row--active .collection__title,
.collection__row--active .collection__idx {
  color: var(--blue);
}

.collection__row--skeleton {
  cursor: default;
}

.skeleton-line {
  height: 8px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--line) 25%, var(--line-strong) 50%, var(--line) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.4s linear infinite;
}

.skeleton-line--short {
  width: 60%;
  justify-self: end;
}

@keyframes skeleton {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }
}

.collection__idx {
  color: var(--text-faint);
  font-size: var(--fs-label);
}

.collection__title,
.collection__singer,
.collection__album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collection__title {
  color: var(--text-dim);
}

.collection__singer,
.collection__album {
  color: var(--text-faint);
}

.collection__time {
  color: var(--text-faint);
  text-align: right;
}

.collection__close {
  width: 18px;
  height: 18px;
  color: var(--text-faint);
  font-size: var(--fs-body);
  line-height: 1;
  cursor: pointer;
}

.collection__close:hover {
  color: var(--text);
}

.collection__more {
  display: flex;
  justify-content: center;
  padding: var(--sp-2) var(--sp-3);
  border-top: var(--hairline);
}
</style>
